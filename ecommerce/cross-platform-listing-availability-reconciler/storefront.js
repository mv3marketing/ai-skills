/**
 * Storefront differ
 * MV3 Marketing — Ecommerce skill
 *
 * The detector that needs no sale feed at all.
 *
 * Every marketplace publishes the seller's own shop as a public page. Polling
 * it and diffing against the ledger answers the question that actually matters
 * — "is this item still live where it shouldn't be?" — without an API, a login,
 * a notification email, or the cross-listing tool. It is also the only detector
 * that finds ORPHANS: listings live on a platform that the ledger has no record
 * of at all, which no sale event will ever reference.
 *
 * Three event classes come out of it:
 *
 *   disappeared    — present before, absent now. Usually the sale itself.
 *   should_be_gone — ledger says sold, storefront still shows it live.
 *   orphan         — live on the platform, absent from the ledger entirely.
 *
 * The dangerous one is `disappeared`, because acting on it writes to inventory.
 * A storefront fetch that returns a truncated page — pagination missed, rate
 * limit, markup change, transient error — makes every unseen item look sold.
 * Trusting that would decrement stock for items that never sold, which is the
 * exact inventory corruption this system exists to prevent. So a snapshot must
 * PROVE itself complete before any of its disappearances count, and a
 * disappearance must repeat across consecutive complete snapshots before it is
 * reported as a sale signal. The completeness test is a ratio ABOVE an absolute
 * floor, so ordinary sell-through on a small shop is never mistaken for a
 * truncated page.
 *
 * Zero dependencies. Pure functions over snapshots the fetch layer hands in;
 * this module never performs network I/O and holds no platform credentials.
 */

'use strict';

const { canonicalizeStatus, parseTimestamp } = require('./availability.js');

/** Default share of a storefront that may vanish between polls before the snapshot is distrusted. */
const DEFAULT_MAX_DISAPPEARANCE_RATIO = 0.2;

/** Default number of consecutive complete snapshots an item must be absent from. */
const DEFAULT_CONFIRMATIONS = 2;

/**
 * Disappearances at or below this count are always trusted, whatever the ratio.
 * Without it the ratio guard is unusable on a small storefront: a shop holding
 * five listings trips 20% the moment one sells. A truncated fetch loses items in
 * bulk, so the ratio only needs to police the bulk case.
 */
const DEFAULT_MIN_DISAPPEARANCES_FOR_RATIO_GUARD = 3;

/**
 * Validate and normalize one storefront poll.
 *
 * @param {Object} snapshot
 * @param {string} snapshot.platform
 * @param {string|number|Date} snapshot.fetchedAt
 * @param {Array<{listingId: string, title?: string, url?: string}>} snapshot.items
 * @param {boolean} snapshot.complete - did the fetch layer see the WHOLE storefront?
 * @param {number} [snapshot.expectedTotal] - the count the page itself advertised, when it does
 * @returns {{platform: string, fetchedAt: number, complete: boolean, expectedTotal: number|null, items: Map<string, Object>}}
 */
function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('A snapshot object is required.');
  const { platform } = snapshot;
  if (typeof platform !== 'string' || platform.trim() === '') {
    throw new Error('Every snapshot needs a non-empty string platform.');
  }
  const key = platform.trim().toLowerCase();

  if (typeof snapshot.complete !== 'boolean') {
    throw new Error(
      `Snapshot for "${key}" must state complete: true or false. A fetch layer that cannot ` +
      'say whether it saw the whole storefront must report false — never omit it, because ' +
      'an unknown-completeness snapshot read as complete turns a truncated page into mass sell-through.'
    );
  }
  if (!Array.isArray(snapshot.items)) throw new Error(`Snapshot for "${key}" needs an items array.`);

  const items = new Map();
  for (const raw of snapshot.items) {
    if (!raw || typeof raw.listingId !== 'string' || raw.listingId.trim() === '') {
      throw new Error(`Every item in the "${key}" snapshot needs a non-empty string listingId.`);
    }
    const listingId = raw.listingId.trim();
    if (items.has(listingId)) {
      throw new Error(`Duplicate listingId "${listingId}" in the "${key}" snapshot.`);
    }
    items.set(listingId, {
      listingId,
      title: typeof raw.title === 'string' ? raw.title : null,
      url: typeof raw.url === 'string' ? raw.url : null,
    });
  }

  let expectedTotal = null;
  if (snapshot.expectedTotal !== undefined && snapshot.expectedTotal !== null) {
    if (!Number.isInteger(snapshot.expectedTotal) || snapshot.expectedTotal < 0) {
      throw new Error(`Snapshot for "${key}" has a non-integer expectedTotal.`);
    }
    expectedTotal = snapshot.expectedTotal;
  }

  return {
    platform: key,
    fetchedAt: parseTimestamp(snapshot.fetchedAt, `snapshot["${key}"].fetchedAt`),
    complete: snapshot.complete,
    expectedTotal,
    items,
  };
}

/**
 * Decide whether a snapshot may be used to conclude that anything disappeared.
 * Presence-only conclusions (orphans, should_be_gone) survive an untrusted snapshot;
 * absence-based ones do not.
 */
function assessTrust(previous, current, maxRatio, floor) {
  if (!previous.complete) return { trusted: false, reason: 'previous_snapshot_incomplete' };
  if (!current.complete) return { trusted: false, reason: 'current_snapshot_incomplete' };

  if (current.expectedTotal !== null && current.items.size !== current.expectedTotal) {
    return { trusted: false, reason: 'item_count_disagrees_with_page_total' };
  }

  if (previous.items.size > 0) {
    let missing = 0;
    for (const id of previous.items.keys()) if (!current.items.has(id)) missing += 1;
    const ratio = missing / previous.items.size;
    if (missing > floor && ratio > maxRatio) {
      return {
        trusted: false,
        reason: 'disappearance_rate_above_threshold',
        detail: `${missing}/${previous.items.size} listings vanished at once (${Math.round(ratio * 100)}%), ` +
          `above the ${Math.round(maxRatio * 100)}% threshold. A truncated fetch looks exactly like this.`,
      };
    }
  }

  return { trusted: true, reason: null };
}

/**
 * Diff two consecutive polls of the same storefront.
 *
 * @param {Object} previousSnapshot
 * @param {Object} currentSnapshot
 * @param {Object} [options]
 * @param {number} [options.maxDisappearanceRatio=0.2]
 * @returns {{platform: string, appeared: Array, disappeared: Array, persisted: Array, trusted: boolean, untrustedReason: string|null, detail: string|null}}
 */
function diffSnapshots(previousSnapshot, currentSnapshot, options = {}) {
  const previous = validateSnapshot(previousSnapshot);
  const current = validateSnapshot(currentSnapshot);

  if (previous.platform !== current.platform) {
    throw new Error(`Cannot diff snapshots from different platforms ("${previous.platform}" vs "${current.platform}").`);
  }
  if (current.fetchedAt < previous.fetchedAt) {
    throw new Error(`Snapshots for "${current.platform}" are out of order — current predates previous.`);
  }

  const maxRatio = options.maxDisappearanceRatio === undefined
    ? DEFAULT_MAX_DISAPPEARANCE_RATIO
    : options.maxDisappearanceRatio;
  if (!Number.isFinite(maxRatio) || maxRatio < 0 || maxRatio > 1) {
    throw new Error('maxDisappearanceRatio must be a number between 0 and 1.');
  }

  const floor = options.minDisappearancesForRatioGuard === undefined
    ? DEFAULT_MIN_DISAPPEARANCES_FOR_RATIO_GUARD
    : options.minDisappearancesForRatioGuard;
  if (!Number.isInteger(floor) || floor < 0) {
    throw new Error('minDisappearancesForRatioGuard must be a non-negative integer.');
  }

  const trust = assessTrust(previous, current, maxRatio, floor);

  const appeared = [];
  const persisted = [];
  const disappeared = [];

  for (const [id, item] of current.items) {
    if (previous.items.has(id)) persisted.push(item);
    else appeared.push(item);
  }
  for (const [id, item] of previous.items) {
    if (!current.items.has(id)) disappeared.push(item);
  }

  return {
    platform: current.platform,
    fetchedAt: current.fetchedAt,
    appeared,
    persisted,
    // An untrusted diff reports no disappearances at all — the whole point of the guard.
    disappeared: trust.trusted ? disappeared : [],
    suppressedDisappearances: trust.trusted ? 0 : disappeared.length,
    trusted: trust.trusted,
    untrustedReason: trust.reason,
    detail: trust.detail || null,
  };
}

/**
 * Require an item to be absent from the last N consecutive TRUSTED diffs before
 * its disappearance counts as a sale signal. One flaky poll never moves stock.
 *
 * @param {Array<Object>} snapshots - same platform, oldest first, at least two
 * @param {Object} [options]
 * @param {number} [options.confirmations=2]
 * @param {number} [options.maxDisappearanceRatio]
 * @returns {{platform: string, confirmed: Array, pending: Array, trustedDiffs: number, untrusted: Array}}
 */
function confirmDisappearances(snapshots, options = {}) {
  if (!Array.isArray(snapshots) || snapshots.length < 2) {
    throw new Error('confirmDisappearances needs at least two snapshots of the same storefront, oldest first.');
  }
  const confirmations = options.confirmations === undefined ? DEFAULT_CONFIRMATIONS : options.confirmations;
  if (!Number.isInteger(confirmations) || confirmations < 1) {
    throw new Error('confirmations must be a positive integer.');
  }

  const validated = snapshots.map(validateSnapshot);
  const diffs = [];
  for (let i = 1; i < snapshots.length; i += 1) {
    diffs.push(diffSnapshots(snapshots[i - 1], snapshots[i], options));
  }

  const platform = diffs[0].platform;
  const untrusted = diffs.filter((d) => !d.trusted).map((d) => ({ reason: d.untrustedReason, detail: d.detail }));

  // Absence is a property of snapshot membership, not of diff events: an item that
  // stays gone produces exactly one disappearance event but many absent snapshots.
  // Count backwards over the unbroken tail of TRUSTED diffs — an untrusted poll ends
  // the window rather than silently extending the streak through it.
  let startIdx = validated.length - 1;
  for (let i = diffs.length - 1; i >= 0; i -= 1) {
    if (!diffs[i].trusted) break;
    startIdx = i;
  }
  const window = validated.slice(startIdx);
  const newest = window.length - 1;

  const seen = new Set();
  for (const snap of window) for (const id of snap.items.keys()) seen.add(id);

  const confirmed = [];
  const pending = [];
  for (const listingId of seen) {
    let lastPresent = -1;
    for (let i = newest; i >= 0; i -= 1) {
      if (window[i].items.has(listingId)) { lastPresent = i; break; }
    }
    if (lastPresent === -1) continue;
    const absentFor = newest - lastPresent;
    if (absentFor < 1) continue;
    const item = window[lastPresent].items.get(listingId);
    (absentFor >= confirmations ? confirmed : pending).push({ ...item, platform, absentFor });
  }

  const byId = (a, b) => (a.listingId < b.listingId ? -1 : a.listingId > b.listingId ? 1 : 0);

  return {
    platform,
    confirmed: confirmed.sort(byId),
    pending: pending.sort(byId),
    trustedDiffs: diffs.filter((d) => d.trusted).length,
    untrusted,
  };
}

function indexLedger(ledger) {
  if (!Array.isArray(ledger)) throw new Error('ledger must be an array of entries.');
  const byPlatformListing = new Map();
  for (const entry of ledger) {
    if (!entry || typeof entry.sku !== 'string' || entry.sku.trim() === '') {
      throw new Error('Every ledger entry needs a non-empty string sku.');
    }
    const status = canonicalizeStatus(entry.status);
    const listings = Array.isArray(entry.listings) ? entry.listings : [];
    for (const l of listings) {
      if (!l || typeof l.platform !== 'string' || typeof l.listingId !== 'string') {
        throw new Error(`Ledger entry "${entry.sku}" has a listing without a platform and listingId.`);
      }
      byPlatformListing.set(`${l.platform.trim().toLowerCase()}::${l.listingId.trim()}`, {
        sku: entry.sku.trim(),
        status,
      });
    }
  }
  return byPlatformListing;
}

/**
 * Compare one storefront snapshot against the ledger. Presence-based only, so
 * this stays valid even when the snapshot is too incomplete to trust absences.
 *
 * @returns {{platform: string, shouldBeGone: Array, orphans: Array, ok: number}}
 */
function reconcileWithLedger(snapshot, ledger) {
  const current = validateSnapshot(snapshot);
  const index = indexLedger(ledger);

  const shouldBeGone = [];
  const orphans = [];
  let ok = 0;

  for (const [listingId, item] of current.items) {
    const entry = index.get(`${current.platform}::${listingId}`);
    if (!entry) {
      orphans.push({ ...item, platform: current.platform });
      continue;
    }
    if (entry.status === 'sold' || entry.status === 'ended') {
      shouldBeGone.push({ ...item, platform: current.platform, sku: entry.sku, ledgerStatus: entry.status });
      continue;
    }
    ok += 1;
  }

  const byId = (a, b) => (a.listingId < b.listingId ? -1 : a.listingId > b.listingId ? 1 : 0);
  return { platform: current.platform, shouldBeGone: shouldBeGone.sort(byId), orphans: orphans.sort(byId), ok };
}

/**
 * Full pass across every platform's snapshot history.
 *
 * @param {Object} input
 * @param {Object<string, Array<Object>>} input.snapshotsByPlatform - oldest first per platform
 * @param {Array<Object>} input.ledger
 * @param {Object} [input.options] - confirmations, maxDisappearanceRatio
 * @returns {{byPlatform: Object, totals: Object, needsAttention: boolean}}
 */
function buildStorefrontReport(input) {
  if (!input || typeof input !== 'object') throw new Error('buildStorefrontReport requires an input object.');
  const { snapshotsByPlatform, ledger, options = {} } = input;
  if (!snapshotsByPlatform || typeof snapshotsByPlatform !== 'object') {
    throw new Error('snapshotsByPlatform must be an object of platform -> snapshot array.');
  }

  const byPlatform = {};
  const totals = { saleSignals: 0, shouldBeGone: 0, orphans: 0, untrustedPolls: 0, pending: 0 };

  for (const [platform, snapshots] of Object.entries(snapshotsByPlatform)) {
    if (!Array.isArray(snapshots) || snapshots.length === 0) {
      throw new Error(`snapshotsByPlatform["${platform}"] must be a non-empty array.`);
    }
    const latest = snapshots[snapshots.length - 1];
    const ledgerView = reconcileWithLedger(latest, ledger);

    let disappearance = { confirmed: [], pending: [], trustedDiffs: 0, untrusted: [] };
    if (snapshots.length >= 2) disappearance = confirmDisappearances(snapshots, options);

    byPlatform[platform] = {
      saleSignals: disappearance.confirmed,
      pendingDisappearances: disappearance.pending,
      shouldBeGone: ledgerView.shouldBeGone,
      orphans: ledgerView.orphans,
      liveAndCorrect: ledgerView.ok,
      trustedDiffs: disappearance.trustedDiffs,
      untrustedPolls: disappearance.untrusted,
    };

    totals.saleSignals += disappearance.confirmed.length;
    totals.pending += disappearance.pending.length;
    totals.shouldBeGone += ledgerView.shouldBeGone.length;
    totals.orphans += ledgerView.orphans.length;
    totals.untrustedPolls += disappearance.untrusted.length;
  }

  return {
    byPlatform,
    totals,
    needsAttention: totals.shouldBeGone > 0 || totals.orphans > 0 || totals.untrustedPolls > 0,
  };
}

module.exports = {
  DEFAULT_MAX_DISAPPEARANCE_RATIO,
  DEFAULT_CONFIRMATIONS,
  DEFAULT_MIN_DISAPPEARANCES_FOR_RATIO_GUARD,
  validateSnapshot,
  diffSnapshots,
  confirmDisappearances,
  reconcileWithLedger,
  buildStorefrontReport,
};
