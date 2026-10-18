import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Poshmark storefront poller.
//
// Walks the seller's public closet across all three availability views. The
// earlier version fetched only the default view, which lists available items
// alone. Everything else was therefore invisible: 1,483 sold listings never
// reached vti.sales (sale detection read "blind"), and 41 deactivated listings
// were never recorded at all. Worse, the differ saw an item leave the available
// view and could not tell sold from deactivated from deleted - on 12 Oct it
// logged 37 "removals" that were 34 manual deactivations plus 3 real sales, and
// no delisting at all.
//
// The filter is a hint, not an answer: ?availability=sold returns sold AND
// available records mixed. Every record is classified by its own
// inventory.status, and inventory.status_changed_at gives the sale timestamp -
// real sale detection from a public page, with no credentials.
//
// Snapshots still carry the AVAILABLE set only, so run_storefront_diff keeps
// comparing like with like.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CLOSET = Deno.env.get("POSHMARK_CLOSET") ?? "vintagetoysio";
const MAX_PAGES = 70;
// The available view alone backs the snapshot and runs hourly in ~30s. The sold
// and not-for-sale views add ~110s, which overran the edge runtime's wall clock
// on the hourly schedule, so they run on their own slower census ({"full":true}).
const FAST_VIEWS = [""] as const;
const FULL_VIEWS = ["", "sold", "not_for_sale"] as const;
const STATUS: Record<string, string> = {
  available: "available",
  sold_out: "sold",
  not_for_sale: "inactive",
};

function extractState(html: string): any {
  const key = "window.__INITIAL_STATE__=";
  const i = html.indexOf(key);
  if (i < 0) throw new Error("state blob not found");
  let depth = 0, inStr = false, esc = false;
  for (let j = i + key.length; j < html.length; j++) {
    const c = html[j];
    if (esc) { esc = false; continue; }
    if (c === "\\" && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      return JSON.parse(html.slice(i + key.length, j + 1));
    }
  }
  throw new Error("unterminated state blob");
}

const quantityOf = (p: any): number =>
  (p?.inventory?.size_quantities ?? []).reduce(
    (n: number, s: any) => n + (s?.quantity_available ?? 0), 0);

async function walk(filter: string) {
  const out = new Map<string, any>();
  let maxId: string | null = null, pages = 0;
  let total: number | null = null, ended = false, failure: string | null = null;
  while (pages < MAX_PAGES) {
    const qs = new URLSearchParams();
    if (filter) qs.set("availability", filter);
    if (maxId) qs.set("max_id", maxId);
    const url = `https://poshmark.com/closet/${CLOSET}${qs.toString() ? "?" + qs : ""}`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) { failure = `http_${res.status}_page_${pages + 1}`; break; }
    const lp = extractState(await res.text())?.["$_closet"]?.listingsPostData;
    const batch: any[] = lp?.data ?? [];
    const more = lp?.more ?? {};
    if (pages === 0) total = more?.total ?? null;
    let fresh = 0;
    for (const p of batch) if (p?.id && !out.has(p.id)) { out.set(p.id, p); fresh++; }
    pages++;
    if (fresh === 0 || !more?.is_next_max_id_present) { ended = true; break; }
    maxId = more?.next_max_id ?? null;
    if (!maxId) { ended = true; break; }
    await new Promise((r) => setTimeout(r, 1100));
  }
  // A view is trustworthy only if the walk finished AND the count it collected
  // matches the total the page itself advertised.
  const ok = !failure && ended && (total === null || out.size === total);
  return { filter: filter || "default", pages, total, ended, failure, ok, posts: [...out.values()] };
}

Deno.serve(async (req) => {
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let full = false;
  try { full = !!(await req.json())?.full; } catch { /* no body: fast poll */ }

  const views = [];
  for (const v of (full ? FULL_VIEWS : FAST_VIEWS)) { try { views.push(await walk(v)); } catch (e) {
    views.push({ filter: v || "default", pages: 0, total: null, ended: false, ok: false,
      failure: `parse_error: ${e instanceof Error ? e.message : String(e)}`, posts: [] });
  } }

  const all = new Map<string, any>();
  for (const v of views) for (const p of v.posts) all.set(p.id, p);
  const records = [...all.values()];
  const classify = (p: any) => STATUS[p?.inventory?.status] ?? "unknown";
  const available = records.filter((p) => classify(p) === "available");

  // Only the available view decides completeness, because only it backs the
  // snapshot the differ reads. The sold view advertises its total on page one
  // and the closet keeps growing through a 90s walk, so a small disagreement
  // there is a race, not a truncated read - it must not make the snapshot
  // untrusted and stall detection.
  const describe = (v: typeof views[number]) =>
    `${v.filter}:${v.failure ?? (!v.ended ? "pagination_did_not_finish" : "count_disagrees_with_total")}`;
  const primary = views.find((v) => v.filter === "default")!;
  const complete = primary.ok;
  const others = views.filter((v) => v.filter !== "default" && !v.ok);
  const reason = !primary.ok
    ? describe(primary)
    : (others.length ? "note:" + others.map(describe).join(",") : null);

  // Snapshot = the available set, so the differ's semantics are unchanged.
  const { data: snap, error: snapErr } = await db.schema("vti").from("snapshots")
    .insert({
      platform_slug: "poshmark", complete,
      expected_total: views[0]?.total ?? null,
      item_count: available.length, untrusted_reason: reason,
    }).select("id").single();
  if (snapErr) {
    return new Response(JSON.stringify({ error: snapErr.message }), {
      status: 500, headers: { "Content-Type": "application/json" } });
  }

  const chunk = <T>(a: T[], n: number) =>
    Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

  for (const c of chunk(available, 500)) {
    await db.schema("vti").from("snapshot_items").insert(c.map((p) => ({
      snapshot_id: snap.id, external_listing_id: p.id,
      title: (p.title ?? "").slice(0, 200),
      url: `https://poshmark.com/listing/${p.id}`,
    })));
  }

  for (const c of chunk(records, 500)) {
    await db.schema("vti").from("listings").upsert(c.map((p) => ({
      platform_slug: "poshmark", external_listing_id: p.id,
      url: `https://poshmark.com/listing/${p.id}`,
      status: classify(p), quantity_listed: quantityOf(p),
      status_changed_at: p?.inventory?.status_changed_at ?? null,
      last_seen_at: new Date().toISOString(),
    })), { onConflict: "platform_slug,external_listing_id" });
  }

  const counts: Record<string, number> = {};
  for (const p of records) counts[classify(p)] = (counts[classify(p)] ?? 0) + 1;

  return new Response(JSON.stringify({
    snapshot_id: snap.id, mode: full ? "census" : "fast", complete, untrusted_reason: reason,
    views: views.map(({ filter, pages, total, ok, failure, posts }) =>
      ({ filter, pages, advertised_total: total, fetched: posts.length, ok, failure })),
    union_total: records.length, by_status: counts,
    multi_quantity_listings: records.filter((p) => quantityOf(p) > 1).length,
  }), { headers: { "Content-Type": "application/json" } });
});
