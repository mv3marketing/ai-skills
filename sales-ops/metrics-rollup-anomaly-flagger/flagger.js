/**
 * Metrics Rollup & Anomaly Flagger
 * MV3 Marketing — Sales Engagement skill
 *
 * Normalizes sequence performance across platforms that define "reply" and
 * "open" differently, then flags real statistical anomalies in a metric's
 * history using a robust (outlier-resistant) method, not a naive average.
 *
 * Two real problems this solves:
 *
 *   1. Cross-platform metric comparability — raw reply rate is inflated by
 *      auto-replies (out-of-office, "please remove me", misclassified
 *      bounces) unless a tool separates them out. Raw open rate is
 *      inflated on any platform affected by Apple Mail Privacy Protection,
 *      which prefetches tracking pixels regardless of whether a human
 *      opened the email. This does NOT invent a "correction factor" for
 *      MPP inflation (nobody knows the true bias without ground truth) --
 *      it honestly flags the metric as directionally-indicative-only
 *      instead of pretending to fix it.
 *   2. Anomaly detection on a metric history using the median + MAD
 *      (median absolute deviation) modified z-score method (Iglewicz &
 *      Hoaglin, 1993) instead of a mean/stdev z-score, because a single
 *      real spike or crash in the history should not distort the baseline
 *      used to judge itself -- the classic failure of naive stdev-based
 *      anomaly detection on data that already contains anomalies.
 */

'use strict';

const DEFAULT_MODIFIED_Z_THRESHOLD = 3.5; // standard constant from Iglewicz & Hoaglin's modified z-score method
const MAD_SCALE_CONSTANT = 0.6745; // scales MAD to be comparable to a standard deviation under normality

/**
 * @param {number[]} values
 * @returns {number}
 */
function median(values) {
  if (!Array.isArray(values) || values.length === 0) throw new Error('values must be a non-empty array.');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * @param {number[]} values
 * @param {number} [med] - precomputed median, to avoid recomputing
 * @returns {number}
 */
function medianAbsoluteDeviation(values, med = median(values)) {
  const deviations = values.map((v) => Math.abs(v - med));
  return median(deviations);
}

/**
 * Excludes auto-replies (out-of-office, misclassified bounces, "remove me"
 * autoresponders) before computing reply rate, since they inflate raw
 * numbers without reflecting genuine engagement.
 * @param {number} rawReplies
 * @param {number} sent
 * @param {number} [autoReplies=0]
 * @returns {{rate: number, genuineReplies: number}}
 */
function normalizeReplyRate(rawReplies, sent, autoReplies = 0) {
  if (typeof sent !== 'number' || sent <= 0) throw new Error('sent must be a positive number.');
  if (typeof rawReplies !== 'number' || rawReplies < 0) throw new Error('rawReplies must be a non-negative number.');
  if (typeof autoReplies !== 'number' || autoReplies < 0) throw new Error('autoReplies must be a non-negative number.');
  if (autoReplies > rawReplies) throw new Error('autoReplies cannot exceed rawReplies.');

  const genuineReplies = rawReplies - autoReplies;
  return { rate: Number((genuineReplies / sent).toFixed(4)), genuineReplies };
}

/**
 * Computes open rate, honestly flagging platforms known to be affected by
 * Apple Mail Privacy Protection (pixel prefetching) as directionally
 * indicative only -- NOT silently "corrected" with an invented factor.
 * @param {number} rawOpens
 * @param {number} sent
 * @param {boolean} [mppAffected=false]
 * @returns {{rate: number, reliable: boolean, reason: string|null}}
 */
function normalizeOpenRate(rawOpens, sent, mppAffected = false) {
  if (typeof sent !== 'number' || sent <= 0) throw new Error('sent must be a positive number.');
  if (typeof rawOpens !== 'number' || rawOpens < 0) throw new Error('rawOpens must be a non-negative number.');

  const rate = Number((rawOpens / sent).toFixed(4));
  return {
    rate,
    reliable: !mppAffected,
    reason: mppAffected
      ? 'Apple Mail Privacy Protection prefetches tracking pixels regardless of human interaction, inflating this platform\'s open rate by an unknown amount. Treat as directionally indicative only -- not comparable to a non-MPP-affected platform\'s open rate.'
      : null,
  };
}

/**
 * Rolls up multiple platforms' raw sequence performance into one canonical
 * comparison, applying the two normalizations above to every platform.
 * @param {Array<{platform: string, sent: number, opens: number, replies: number, autoReplies?: number, mppAffected?: boolean}>} platformReports
 * @returns {{totalSent: number, blendedReplyRate: number, byPlatform: Array<Object>, anyUnreliableOpenRates: boolean}}
 */
function rollupMetrics(platformReports) {
  if (!Array.isArray(platformReports) || platformReports.length === 0) {
    throw new Error('platformReports must be a non-empty array.');
  }

  let totalSent = 0;
  let totalGenuineReplies = 0;
  let anyUnreliableOpenRates = false;

  const byPlatform = platformReports.map((report) => {
    const { platform, sent, opens, replies, autoReplies = 0, mppAffected = false } = report;
    if (!platform) throw new Error('Each platform report must have a platform name.');

    const replyResult = normalizeReplyRate(replies, sent, autoReplies);
    const openResult = normalizeOpenRate(opens, sent, mppAffected);

    totalSent += sent;
    totalGenuineReplies += replyResult.genuineReplies;
    if (!openResult.reliable) anyUnreliableOpenRates = true;

    return {
      platform,
      sent,
      replyRate: replyResult.rate,
      genuineReplies: replyResult.genuineReplies,
      openRate: openResult.rate,
      openRateReliable: openResult.reliable,
      openRateCaveat: openResult.reason,
    };
  });

  return {
    totalSent,
    blendedReplyRate: Number((totalGenuineReplies / totalSent).toFixed(4)),
    byPlatform,
    anyUnreliableOpenRates,
  };
}

/**
 * Flags statistical anomalies in a chronological metric series using a
 * rolling median + MAD modified z-score -- robust to the baseline itself
 * already containing a prior spike or crash, unlike a mean/stdev z-score.
 * @param {Array<{period: string, value: number}>} series - chronological order
 * @param {Object} [opts]
 * @param {number} [opts.threshold=3.5]
 * @param {number} [opts.minBaselinePoints=5]
 * @returns {Array<{period: string, value: number, modifiedZ: number|null, isAnomaly: boolean, insufficientBaseline: boolean}>}
 */
function detectAnomalies(series, opts = {}) {
  if (!Array.isArray(series) || series.length === 0) throw new Error('series must be a non-empty array.');
  const { threshold = DEFAULT_MODIFIED_Z_THRESHOLD, minBaselinePoints = 5 } = opts;
  if (threshold <= 0) throw new Error('threshold must be positive.');
  if (minBaselinePoints < 2) throw new Error('minBaselinePoints must be at least 2.');

  return series.map((point, i) => {
    if (i < minBaselinePoints) {
      return { period: point.period, value: point.value, modifiedZ: null, isAnomaly: false, insufficientBaseline: true };
    }

    const baseline = series.slice(0, i).map((p) => p.value);
    const med = median(baseline);
    const mad = medianAbsoluteDeviation(baseline, med);

    let modifiedZ;
    if (mad === 0) {
      // A zero MAD means every baseline point was identical -- any
      // deviation at all is meaningful, so treat non-equal values as an
      // infinite-magnitude anomaly rather than dividing by zero.
      modifiedZ = point.value === med ? 0 : (point.value > med ? Infinity : -Infinity);
    } else {
      modifiedZ = Number(((MAD_SCALE_CONSTANT * (point.value - med)) / mad).toFixed(3));
    }

    return {
      period: point.period,
      value: point.value,
      modifiedZ,
      isAnomaly: Math.abs(modifiedZ) > threshold,
      insufficientBaseline: false,
    };
  });
}

module.exports = {
  median,
  medianAbsoluteDeviation,
  normalizeReplyRate,
  normalizeOpenRate,
  rollupMetrics,
  detectAnomalies,
  DEFAULT_MODIFIED_Z_THRESHOLD,
};
