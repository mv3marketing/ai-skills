/**
 * Cross-listing delist pipeline diagnosis
 * MV3 Marketing — Ecommerce skill
 *
 * `availability.js` answers "which listings are wrong, and is it lag or a repost?"
 * This module answers the next question: "which STAGE of the delist pipeline broke?"
 *
 * Every cross-listing stack has the same three stages, and they fail for
 * completely different reasons:
 *
 *   detect   -> the tool notices the sale on the platform it happened on
 *   dispatch -> the tool removes that item from every other platform
 *   publish  -> relist/bump jobs rewrite listings from the local catalog
 *
 * The stage matters more than the symptom. A sold item left live because the
 * sale was never DETECTED cannot be fixed by anything on the dispatch side —
 * and a publish-stage resurrection gets worse the more often you sync.
 *
 * Two structural facts drive most real failures, and both are documented
 * vendor behavior rather than bugs:
 *
 *   1. On most stacks, sale detection for the marketplace platforms runs in a
 *      browser extension that polls every 10-15 minutes and only works while
 *      the computer is on, awake, and the tool's tab is open. Only the
 *      API-backed platforms (eBay, Etsy, Shopify) are detected server-side.
 *      A sale that lands while the machine is asleep is not detected late —
 *      it is typically never detected at all, because the scanner looks at
 *      current state rather than backfilling history.
 *   2. Multi-quantity items are decremented rather than delisted. A one-of-one
 *      collectible carrying quantity > 1 in the tool's catalog will never be
 *      taken down by auto-delist on any platform that supports quantity.
 *
 * Zero dependencies. Pure functions over incidents you record yourself.
 */

'use strict';

const { parseTimestamp } = require('./availability.js');

/**
 * Per-platform behavior of a typical cross-listing stack.
 *
 *   detection            'server' (API, runs without you) | 'extension' (needs your machine awake)
 *   pollMinutes          how often the scanner looks
 *   delistAction         'delist'    — removed outright on a sale
 *                        'decrement' — quantity reduced; only delisted on the LAST unit
 *                        'relist'    — delisted and recreated (new listing id)
 *   blocksDeleteWithOffer  platform refuses to delete a listing with a live offer
 *
 * Override any of this via the `profiles` option — vendors change it.
 */
const PLATFORM_PROFILES = {
  ebay: { detection: 'server', pollMinutes: 15, delistAction: 'decrement', blocksDeleteWithOffer: false },
  etsy: { detection: 'server', pollMinutes: 15, delistAction: 'decrement', blocksDeleteWithOffer: false },
  shopify: { detection: 'server', pollMinutes: 15, delistAction: 'decrement', blocksDeleteWithOffer: false },
  poshmark: { detection: 'extension', pollMinutes: 10, delistAction: 'decrement', blocksDeleteWithOffer: true },
  depop: { detection: 'extension', pollMinutes: 10, delistAction: 'decrement', blocksDeleteWithOffer: false },
  whatnot: { detection: 'extension', pollMinutes: 10, delistAction: 'decrement', blocksDeleteWithOffer: false },
  mercari: { detection: 'extension', pollMinutes: 10, delistAction: 'relist', blocksDeleteWithOffer: true },
  grailed: { detection: 'extension', pollMinutes: 10, delistAction: 'relist', blocksDeleteWithOffer: false },
  vinted: { detection: 'extension', pollMinutes: 30, delistAction: 'none', blocksDeleteWithOffer: false },
  facebook: { detection: 'extension', pollMinutes: 10, delistAction: 'none', blocksDeleteWithOffer: false },
};

const CAUSES = {
  detection_missed_offline: {
    stage: 'detect',
    severity: 'critical',
    fix: 'Sale landed while the scanner was not running. Move detection server-side where the platform allows it, keep a always-on machine for the extension, or reconcile sold reports daily.',
  },
  detection_unsupported_platform: {
    stage: 'detect',
    severity: 'critical',
    fix: 'This platform has no automatic sale detection in your stack. Its sales must be recorded manually or nothing downstream ever fires.',
  },
  detection_never_fired: {
    stage: 'detect',
    severity: 'critical',
    fix: 'Scanner was up but never recorded the sale. Check marketplace connection/session health and whether the listing is linked in the tool.',
  },
  listing_not_linked: {
    stage: 'dispatch',
    severity: 'high',
    fix: 'The tool cannot delist what it does not know it owns. Re-link the listing; listings created natively on the platform or recreated by a relist are unlinked.',
  },
  multi_quantity_no_delist: {
    stage: 'dispatch',
    severity: 'critical',
    fix: 'Quantity > 1 means auto-delist decrements instead of removing. Set one-of-one inventory to quantity 1 across the catalog.',
  },
  blocked_by_active_offer: {
    stage: 'dispatch',
    severity: 'high',
    fix: 'Platform refuses to delete a listing with a live offer or bundle. Expire/decline open offers before delisting, and sweep these manually.',
  },
  dispatch_failed: {
    stage: 'dispatch',
    severity: 'high',
    fix: 'Sale was detected but the listing is still live past the poll window. Check that marketplace connection and the delist queue for errors.',
  },
  relist_after_sale: {
    stage: 'publish',
    severity: 'critical',
    fix: 'A relist/bump job recreated this listing after the sale. Gate the relister on sold state; note the recreated listing has a new id, which breaks linkage and blocks every future delist.',
  },
  dispatch_pending: {
    stage: 'dispatch',
    severity: 'low',
    fix: 'Still inside the poll window. No action; verify after the window closes.',
  },
};

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

function profileFor(platform, profiles) {
  const key = String(platform).trim().toLowerCase();
  const profile = profiles[key];
  if (!profile) {
    throw new Error(
      `Unknown platform "${platform}". Add it to PLATFORM_PROFILES or pass it via the profiles option.`
    );
  }
  return { key, profile };
}

/**
 * Was the scanner running when the sale landed?
 * `uptimeWindows` are the periods your machine/extension was actually up.
 * Omit them and detection timing is not judged (returns 'unknown').
 */
function wasScannerUp(soldAtMs, uptimeWindows) {
  if (!Array.isArray(uptimeWindows) || uptimeWindows.length === 0) return 'unknown';
  for (const w of uptimeWindows) {
    const from = parseTimestamp(w.from, 'uptimeWindow.from');
    const to = parseTimestamp(w.to, 'uptimeWindow.to');
    if (to < from) throw new Error('An uptime window ends before it starts.');
    if (soldAtMs >= from && soldAtMs <= to) return 'up';
  }
  return 'down';
}

/**
 * Diagnose one stuck listing: item sold on `salePlatform`, still live on `stuckOn`.
 *
 * @param {Object} incident
 * @param {string} incident.item
 * @param {string} incident.salePlatform - where the sale actually happened
 * @param {string|number|Date} incident.soldAt
 * @param {string[]} incident.stuckOn - platforms where it is still live
 * @param {number} [incident.quantity=1] - quantity carried in the cross-lister's catalog
 * @param {string|number|Date|null} [incident.detectedAt] - when the tool recorded the sale; null = never
 * @param {string[]} [incident.activeOfferOn] - platforms with a live offer/bundle
 * @param {string[]} [incident.notLinkedOn] - platforms where the listing is not linked to the catalog
 * @param {string[]} [incident.repostedOn] - platforms where the listing was recreated after the sale
 * @param {Object} [options]
 * @param {Array<{from: string, to: string}>} [options.uptimeWindows]
 * @param {Object} [options.profiles]
 * @param {string|number|Date} [options.now]
 * @returns {{item: string, salePlatform: string, detection: Object, perPlatform: Array<Object>}}
 */
function diagnoseIncident(incident, options = {}) {
  if (!incident || typeof incident !== 'object') throw new Error('diagnoseIncident requires an incident object.');
  const { item, salePlatform, stuckOn } = incident;
  if (typeof item !== 'string' || item.trim() === '') throw new Error('Every incident needs a non-empty item name.');
  if (!Array.isArray(stuckOn)) throw new Error(`Incident "${item}" needs stuckOn as an array of platforms.`);

  const profiles = { ...PLATFORM_PROFILES, ...(options.profiles || {}) };
  const nowMs = options.now === undefined ? Date.now() : parseTimestamp(options.now, 'now');
  const soldAtMs = parseTimestamp(incident.soldAt, `incident "${item}".soldAt`);
  if (soldAtMs > nowMs) throw new Error(`Incident "${item}" sold in the future relative to now.`);

  const { key: saleKey, profile: saleProfile } = profileFor(salePlatform, profiles);
  const quantity = incident.quantity === undefined ? 1 : incident.quantity;
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error(`Incident "${item}" needs an integer quantity >= 1.`);

  const activeOfferOn = (incident.activeOfferOn || []).map((p) => String(p).toLowerCase());
  const notLinkedOn = (incident.notLinkedOn || []).map((p) => String(p).toLowerCase());
  const repostedOn = (incident.repostedOn || []).map((p) => String(p).toLowerCase());

  // --- detect stage: one verdict per incident ---
  const scanner = wasScannerUp(soldAtMs, options.uptimeWindows);
  const detectedAt =
    incident.detectedAt === undefined || incident.detectedAt === null
      ? null
      : parseTimestamp(incident.detectedAt, `incident "${item}".detectedAt`);

  let detectionCause = null;
  if (saleProfile.delistAction === 'none' && saleProfile.detection === 'extension' && detectedAt === null) {
    detectionCause = 'detection_unsupported_platform';
  } else if (detectedAt === null) {
    if (saleProfile.detection === 'extension' && scanner === 'down') detectionCause = 'detection_missed_offline';
    else detectionCause = 'detection_never_fired';
  }

  const detection = {
    salePlatform: saleKey,
    transport: saleProfile.detection,
    scannerUpAtSale: scanner,
    detectedAt,
    cause: detectionCause,
  };

  // --- dispatch / publish stages: one verdict per stuck platform ---
  const perPlatform = stuckOn.map((target) => {
    const { key, profile } = profileFor(target, profiles);
    let cause;

    if (repostedOn.includes(key)) {
      cause = 'relist_after_sale';
    } else if (detectionCause) {
      cause = detectionCause; // nothing downstream could have run
    } else if (notLinkedOn.includes(key)) {
      cause = 'listing_not_linked';
    } else if (quantity > 1 && profile.delistAction === 'decrement') {
      cause = 'multi_quantity_no_delist';
    } else if (profile.blocksDeleteWithOffer && activeOfferOn.includes(key)) {
      cause = 'blocked_by_active_offer';
    } else if (profile.delistAction === 'none') {
      cause = 'detection_unsupported_platform';
    } else if (nowMs - detectedAt <= profile.pollMinutes * 60000) {
      cause = 'dispatch_pending';
    } else {
      cause = 'dispatch_failed';
    }

    return {
      platform: key,
      cause,
      stage: CAUSES[cause].stage,
      severity: CAUSES[cause].severity,
      fix: CAUSES[cause].fix,
      minutesLive: Math.max(0, Math.round((nowMs - soldAtMs) / 60000)),
    };
  });

  return { item, salePlatform: saleKey, detection, perPlatform };
}

/**
 * Run a batch of incidents and rank the causes by how much of the problem each explains.
 *
 * @param {Array<Object>} incidents
 * @param {Object} [options] - same options as diagnoseIncident
 * @returns {{diagnoses: Array<Object>, ranked: Array<Object>, stageShare: Object<string, number>}}
 */
function runRootCauseAnalysis(incidents, options = {}) {
  if (!Array.isArray(incidents) || incidents.length === 0) {
    throw new Error('runRootCauseAnalysis requires a non-empty array of incidents.');
  }

  const diagnoses = incidents.map((i) => diagnoseIncident(i, options));

  const tally = new Map();
  const stageShare = {};
  let total = 0;

  for (const d of diagnoses) {
    for (const p of d.perPlatform) {
      total += 1;
      stageShare[p.stage] = (stageShare[p.stage] || 0) + 1;
      if (!tally.has(p.cause)) {
        tally.set(p.cause, { cause: p.cause, stage: p.stage, severity: p.severity, fix: p.fix, count: 0, items: new Set(), platforms: new Set() });
      }
      const entry = tally.get(p.cause);
      entry.count += 1;
      entry.items.add(d.item);
      entry.platforms.add(p.platform);
    }
  }

  const ranked = [...tally.values()]
    .map((e) => ({
      cause: e.cause,
      stage: e.stage,
      severity: e.severity,
      count: e.count,
      share: Math.round((e.count / total) * 1000) / 10,
      items: [...e.items].sort(),
      platforms: [...e.platforms].sort(),
      fix: e.fix,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      return bySeverity !== 0 ? bySeverity : a.cause < b.cause ? -1 : 1;
    });

  for (const stage of Object.keys(stageShare)) {
    stageShare[stage] = Math.round((stageShare[stage] / total) * 1000) / 10;
  }

  return { diagnoses, ranked, stageShare };
}

module.exports = { PLATFORM_PROFILES, CAUSES, diagnoseIncident, runRootCauseAnalysis, wasScannerUp };
