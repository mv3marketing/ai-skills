/**
 * Cross-Platform Listing Availability Reconciler
 * MV3 Marketing — Ecommerce skill
 *
 * Answers one specific question: why is an item that already sold still
 * showing as available on another platform?
 *
 * There are four genuinely different root causes behind that one symptom,
 * and they need opposite fixes:
 *
 *   1. sync_lag              — the platform simply hasn't been told yet, and
 *                              the delay is inside the sync window you run.
 *                              Waiting fixes it. Nothing is broken.
 *   2. stale_beyond_window   — it has been wrong for longer than your own
 *                              sync cadence should allow. The sync ran and
 *                              missed it, or the cadence is too slow for how
 *                              fast this item sells.
 *   3. repost_after_sale     — the listing was WRITTEN to the platform AFTER
 *                              the sale and still says available. This is the
 *                              "sold items keep coming back" case. It is not
 *                              latency: a publisher, bulk feed regeneration,
 *                              or two-way sync loop is actively recreating
 *                              the listing from a source that doesn't know
 *                              about the sale. More frequent syncing makes
 *                              this WORSE, not better.
 *   4. status_mapping_gap    — the platform reports a status your mapping
 *                              doesn't recognize, so nothing ever classified
 *                              it as sold.
 *
 * Treating all four as "sync lag" is why the problem never goes away.
 *
 * Zero dependencies. A pure function over snapshots you export yourself —
 * not a live integration with any marketplace API.
 */

'use strict';

/** Canonical availability states every platform vocabulary collapses into. */
const CANONICAL_STATUSES = ['available', 'reserved', 'sold', 'ended', 'unknown'];

/**
 * Raw per-platform status vocabularies, mapped to canonical states.
 * Anything not listed here becomes 'unknown' — never 'available'.
 */
const STATUS_VOCABULARY = {
  available: [
    'available', 'active', 'in_stock', 'instock', 'live', 'published',
    'for_sale', 'listed', 'on_sale', 'buyable', 'in_stock_online',
  ],
  reserved: [
    'reserved', 'pending', 'pending_payment', 'awaiting_payment',
    'on_hold', 'hold', 'in_cart_hold', 'offer_accepted',
  ],
  sold: [
    'sold', 'sold_out', 'out_of_stock', 'oos', 'purchased',
    'order_placed', 'quantity_zero', 'no_stock',
  ],
  ended: [
    'ended', 'delisted', 'removed', 'archived', 'deleted', 'expired',
    'unpublished', 'inactive', 'draft', 'closed',
  ],
};

/** How bad each classification is. Ordered worst-first for sorting. */
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };

const CLASSIFICATION_SEVERITY = {
  repost_after_sale: 'critical',
  stale_beyond_window: 'high',
  reserved_but_live: 'high',
  orphan_listing: 'high',
  status_mapping_gap: 'medium',
  sync_lag: 'low',
  unlisted_available: 'low',
  in_sync: 'none',
};

const CLASSIFICATION_ACTION = {
  repost_after_sale: 'stop_republishing',
  stale_beyond_window: 'delist',
  reserved_but_live: 'delist',
  orphan_listing: 'investigate',
  status_mapping_gap: 'map_status',
  sync_lag: 'wait',
  unlisted_available: 'relist',
  in_sync: 'none',
};

const AMBIGUOUS_TIMESTAMP_HINT =
  'Timestamps must carry an explicit timezone (e.g. "2026-09-18T14:02:00Z" or ' +
  '"2026-09-18T10:02:00-04:00"). A local-time string compared against another ' +
  'platform\'s local time can be off by up to 14 hours, which is exactly the ' +
  'window where a repost gets misread as sync lag.';

const TZ_AWARE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Collapse a raw platform status string to a canonical state.
 * Fail-closed: anything unrecognized becomes 'unknown', never 'available'.
 *
 * @param {string|null|undefined} raw
 * @returns {'available'|'reserved'|'sold'|'ended'|'unknown'}
 */
function canonicalizeStatus(raw) {
  if (raw === null || raw === undefined) return 'unknown';
  if (typeof raw !== 'string') {
    throw new Error(`Status must be a string or null, got ${typeof raw}.`);
  }
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (key === '') return 'unknown';
  for (const canonical of Object.keys(STATUS_VOCABULARY)) {
    if (STATUS_VOCABULARY[canonical].includes(key)) return canonical;
  }
  return 'unknown';
}

/**
 * Parse a timestamp to epoch milliseconds, rejecting timezone-ambiguous input.
 *
 * @param {string|number|Date} value
 * @param {string} label - field name, for the error message
 * @returns {number} epoch milliseconds
 */
function parseTimestamp(value, label = 'timestamp') {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`${label} is an invalid Date.`);
    return value.getTime();
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} must be a finite epoch-ms number.`);
    return value;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required (ISO-8601 string with timezone, epoch ms, or Date).`);
  }
  const trimmed = value.trim();
  if (!TZ_AWARE_ISO.test(trimmed)) {
    throw new Error(`${label} "${trimmed}" is not timezone-explicit. ${AMBIGUOUS_TIMESTAMP_HINT}`);
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) throw new Error(`${label} "${trimmed}" is not a parseable date.`);
  return ms;
}

function indexInventory(inventory) {
  if (!Array.isArray(inventory) || inventory.length === 0) {
    throw new Error('inventory must be a non-empty array of source-of-truth records.');
  }
  const bySku = new Map();
  for (const item of inventory) {
    if (!item || typeof item.sku !== 'string' || item.sku.trim() === '') {
      throw new Error('Every inventory record needs a non-empty string sku.');
    }
    const sku = item.sku.trim();
    if (bySku.has(sku)) {
      throw new Error(
        `Duplicate sku "${sku}" in inventory. The source of truth cannot hold two states ` +
        'for one sku — deduplicate before reconciling.'
      );
    }
    bySku.set(sku, {
      sku,
      status: canonicalizeStatus(item.status),
      rawStatus: item.status,
      changedAt: parseTimestamp(item.statusChangedAt, `inventory["${sku}"].statusChangedAt`),
    });
  }
  return bySku;
}

function classifyListing(source, listing, options) {
  const { nowMs, windowMinutes, repostGraceMs } = options;
  const listingStatus = listing.status;
  const writtenAt = listing.writtenAt;

  if (!source) {
    return {
      classification: 'orphan_listing',
      detail:
        'This sku is live on the platform but absent from the source of truth. Usually an ' +
        'item-ID change (variant regenerated, re-created listing) that left the old record orphaned.',
      lagMinutes: null,
    };
  }

  if (listingStatus === 'unknown') {
    return {
      classification: 'status_mapping_gap',
      detail:
        `Platform status ${JSON.stringify(listing.rawStatus)} maps to no canonical state, so ` +
        'nothing ever classified this listing as sold. Add it to STATUS_VOCABULARY.',
      lagMinutes: null,
    };
  }

  const sourceIsGone = source.status === 'sold' || source.status === 'ended';
  const lagMinutes = Math.max(0, Math.round((nowMs - source.changedAt) / 60000));

  if (sourceIsGone && listingStatus === 'available') {
    if (writtenAt > source.changedAt + repostGraceMs) {
      return {
        classification: 'repost_after_sale',
        detail:
          `The listing was written ${Math.round((writtenAt - source.changedAt) / 60000)} minutes ` +
          'AFTER the sale and still says available. This is not latency — something is ' +
          'republishing this item from a source that does not know it sold. Syncing more ' +
          'often will not fix it.',
        lagMinutes,
      };
    }
    if (lagMinutes > windowMinutes) {
      return {
        classification: 'stale_beyond_window',
        detail:
          `Wrong for ${lagMinutes} minutes against a ${windowMinutes}-minute sync window. ` +
          'The sync either did not run or skipped this item.',
        lagMinutes,
      };
    }
    return {
      classification: 'sync_lag',
      detail:
        `Wrong for ${lagMinutes} minutes, inside the ${windowMinutes}-minute sync window. ` +
        'Expected latency, not a defect — but it is still a live oversell window.',
      lagMinutes,
    };
  }

  if (source.status === 'reserved' && listingStatus === 'available') {
    return {
      classification: 'reserved_but_live',
      detail:
        'Held/pending in the source but still buyable on this platform. A second buyer can ' +
        'purchase the same unit before the hold resolves.',
      lagMinutes,
    };
  }

  if (source.status === 'available' && (listingStatus === 'sold' || listingStatus === 'ended')) {
    return {
      classification: 'unlisted_available',
      detail: 'In stock in the source but dead on this platform — lost sales, not oversell risk.',
      lagMinutes,
    };
  }

  return { classification: 'in_sync', detail: 'Source and platform agree.', lagMinutes: 0 };
}

/**
 * Reconcile per-platform listing snapshots against one source-of-truth inventory snapshot.
 *
 * @param {Object} input
 * @param {Array<{sku: string, status: string, statusChangedAt: string}>} input.inventory
 * @param {Array<{platform: string, sku: string, status: string, lastWrittenAt: string, listingId?: string}>} input.listings
 * @param {string|number|Date} [input.now] - evaluation time (defaults to Date.now())
 * @param {Object<string, number>} [input.syncWindowMinutes] - per-platform expected sync cadence
 * @param {number} [input.defaultSyncWindowMinutes=60]
 * @param {number} [input.repostGraceMinutes=5] - writes this soon after a sale count as a race, not a repost
 * @returns {{findings: Array<Object>, counts: Object<string, number>}}
 */
function reconcileListings(input) {
  if (!input || typeof input !== 'object') throw new Error('reconcileListings requires an input object.');
  const {
    inventory,
    listings,
    now,
    syncWindowMinutes = {},
    defaultSyncWindowMinutes = 60,
    repostGraceMinutes = 5,
  } = input;

  if (!Array.isArray(listings)) throw new Error('listings must be an array of platform listing records.');
  if (!Number.isFinite(defaultSyncWindowMinutes) || defaultSyncWindowMinutes <= 0) {
    throw new Error('defaultSyncWindowMinutes must be a positive number.');
  }
  if (!Number.isFinite(repostGraceMinutes) || repostGraceMinutes < 0) {
    throw new Error('repostGraceMinutes must be a non-negative number.');
  }
  for (const [platform, minutes] of Object.entries(syncWindowMinutes)) {
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new Error(`syncWindowMinutes["${platform}"] must be a positive number.`);
    }
  }

  const bySku = indexInventory(inventory);
  const nowMs = now === undefined ? Date.now() : parseTimestamp(now, 'now');
  const repostGraceMs = repostGraceMinutes * 60000;

  const findings = [];
  const counts = {};

  for (const raw of listings) {
    if (!raw || typeof raw.platform !== 'string' || raw.platform.trim() === '') {
      throw new Error('Every listing record needs a non-empty string platform.');
    }
    if (typeof raw.sku !== 'string' || raw.sku.trim() === '') {
      throw new Error(`Every listing record needs a non-empty string sku (platform "${raw.platform}").`);
    }
    const platform = raw.platform.trim();
    const sku = raw.sku.trim();
    const listing = {
      platform,
      sku,
      listingId: raw.listingId === undefined ? null : raw.listingId,
      rawStatus: raw.status,
      status: canonicalizeStatus(raw.status),
      writtenAt: parseTimestamp(raw.lastWrittenAt, `listing["${platform}"]["${sku}"].lastWrittenAt`),
    };

    const windowMinutes = Object.prototype.hasOwnProperty.call(syncWindowMinutes, platform)
      ? syncWindowMinutes[platform]
      : defaultSyncWindowMinutes;

    const source = bySku.get(sku) || null;
    const { classification, detail, lagMinutes } = classifyListing(source, listing, {
      nowMs,
      windowMinutes,
      repostGraceMs,
    });

    findings.push({
      sku,
      platform,
      listingId: listing.listingId,
      listingStatus: listing.status,
      sourceStatus: source ? source.status : null,
      classification,
      severity: CLASSIFICATION_SEVERITY[classification],
      action: CLASSIFICATION_ACTION[classification],
      lagMinutes,
      syncWindowMinutes: windowMinutes,
      detail,
    });

    counts[classification] = (counts[classification] || 0) + 1;
  }

  findings.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    if (a.sku !== b.sku) return a.sku < b.sku ? -1 : 1;
    return a.platform < b.platform ? -1 : a.platform > b.platform ? 1 : 0;
  });

  return { findings, counts };
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Per-platform rollup naming the single most likely cause for that platform.
 * This is the "why is this happening" answer, one line per platform.
 *
 * @param {Array<Object>} findings - from reconcileListings()
 * @returns {Object<string, {counts: Object, medianStaleLagMinutes: number|null, likelyCause: string}>}
 */
function summarizeByPlatform(findings) {
  if (!Array.isArray(findings)) throw new Error('summarizeByPlatform requires the findings array.');
  const byPlatform = {};

  for (const f of findings) {
    if (!byPlatform[f.platform]) {
      byPlatform[f.platform] = { counts: {}, _lags: [], medianStaleLagMinutes: null, likelyCause: 'clean' };
    }
    const entry = byPlatform[f.platform];
    entry.counts[f.classification] = (entry.counts[f.classification] || 0) + 1;
    if (
      typeof f.lagMinutes === 'number' &&
      (f.classification === 'sync_lag' || f.classification === 'stale_beyond_window')
    ) {
      entry._lags.push(f.lagMinutes);
    }
  }

  for (const entry of Object.values(byPlatform)) {
    entry.medianStaleLagMinutes = median(entry._lags);
    delete entry._lags;
    const c = entry.counts;
    if (c.repost_after_sale) {
      entry.likelyCause = 'publisher_republishes_sold_listings';
    } else if (c.status_mapping_gap) {
      entry.likelyCause = 'unmapped_status_vocabulary';
    } else if (c.stale_beyond_window) {
      entry.likelyCause = 'sync_missed_or_cadence_too_slow';
    } else if (c.orphan_listing) {
      entry.likelyCause = 'listing_id_drift';
    } else if (c.reserved_but_live) {
      entry.likelyCause = 'holds_not_propagated';
    } else if (c.sync_lag) {
      entry.likelyCause = 'within_expected_sync_window';
    }
  }

  return byPlatform;
}

/**
 * Concrete per-platform action plan. Only actionable findings appear —
 * in_sync and plain sync_lag (which resolves itself) are excluded.
 *
 * @param {Array<Object>} findings - from reconcileListings()
 * @returns {Object<string, Array<{sku: string, listingId: string|null, action: string, severity: string, reason: string}>>}
 */
function buildDelistPlan(findings) {
  if (!Array.isArray(findings)) throw new Error('buildDelistPlan requires the findings array.');
  const plan = {};
  for (const f of findings) {
    if (f.classification === 'in_sync' || f.classification === 'sync_lag') continue;
    if (!plan[f.platform]) plan[f.platform] = [];
    plan[f.platform].push({
      sku: f.sku,
      listingId: f.listingId,
      action: f.action,
      severity: f.severity,
      reason: f.detail,
    });
  }
  for (const items of Object.values(plan)) {
    items.sort((a, b) => {
      const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      return bySeverity !== 0 ? bySeverity : a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
    });
  }
  return plan;
}

module.exports = {
  CANONICAL_STATUSES,
  STATUS_VOCABULARY,
  CLASSIFICATION_SEVERITY,
  canonicalizeStatus,
  parseTimestamp,
  reconcileListings,
  summarizeByPlatform,
  buildDelistPlan,
};
