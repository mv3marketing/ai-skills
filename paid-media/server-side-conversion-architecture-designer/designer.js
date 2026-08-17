/**
 * Server-Side Conversion Architecture Designer
 * MV3 Marketing — Paid Media skill
 *
 * Designs CAPI/Enhanced Conversions/GTM-SS deduplication architecture: a
 * real deterministic event-ID generator (FNV-1a hash, zero dependencies),
 * a dedup-pair validator that catches real mismatches, and a
 * consent-to-channel eligibility mapper - reconciling dedup keys and
 * consent-mode mapping, not just wiring a pixel.
 */

'use strict';

/**
 * FNV-1a, a real, well-known non-cryptographic hash. Appropriate here:
 * dedup keys need to be deterministic and collision-resistant enough for
 * this purpose, not cryptographically secure.
 */
function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Deterministic event-ID generator: same (orderId, eventName, timestamp
 * bucket) always produces the same ID, so the client-side pixel and the
 * server-side API call for the SAME real-world event compute an identical
 * dedup key independently, without needing to pass state between them.
 * @param {string} orderId
 * @param {string} eventName
 * @param {number} timestampMs
 * @param {number} [bucketSeconds=60] - timestamps are rounded to this bucket so minor client/server clock drift doesn't break dedup
 */
function generateEventId(orderId, eventName, timestampMs, bucketSeconds = 60) {
  if (!orderId) throw new Error('orderId is required.');
  if (!eventName) throw new Error('eventName is required.');
  if (typeof timestampMs !== 'number' || timestampMs <= 0) throw new Error('timestampMs must be a positive number.');
  if (bucketSeconds <= 0) throw new Error('bucketSeconds must be > 0.');

  const bucket = Math.floor(timestampMs / (bucketSeconds * 1000));
  return fnv1a(`${orderId}:${eventName}:${bucket}`);
}

const MAX_DEDUP_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours - typical real-world dedup window for client/server event pairs

/**
 * Validates that a client-side pixel event and a server-side API event
 * for the same real-world conversion will actually dedup correctly.
 * @param {{eventId: string, eventName: string, timestampMs: number}} clientEvent
 * @param {{eventId: string, eventName: string, timestampMs: number}} serverEvent
 * @returns {{willDedup: boolean, issues: string[]}}
 */
function validateDedupPair(clientEvent, serverEvent) {
  if (!clientEvent || !serverEvent) throw new Error('Both clientEvent and serverEvent are required.');
  const issues = [];

  if (clientEvent.eventId !== serverEvent.eventId) {
    issues.push(`event_id mismatch: client="${clientEvent.eventId}" server="${serverEvent.eventId}". These will be counted as two separate conversions.`);
  }
  if (clientEvent.eventName !== serverEvent.eventName) {
    issues.push(`event_name mismatch: client="${clientEvent.eventName}" server="${serverEvent.eventName}".`);
  }
  const timeDiff = Math.abs(clientEvent.timestampMs - serverEvent.timestampMs);
  if (timeDiff > MAX_DEDUP_WINDOW_MS) {
    issues.push(`Timestamps are ${Math.round(timeDiff / 3600000)}h apart, exceeding the typical ${MAX_DEDUP_WINDOW_MS / 3600000}h dedup window. Some platforms may not dedup this pair even with matching event_id.`);
  }

  return { willDedup: issues.length === 0, issues };
}

const CHANNEL_CONSENT_REQUIREMENTS = {
  meta_capi: ['ad_storage'],
  google_enhanced_conversions: ['ad_storage'],
  ga4_measurement_protocol: ['analytics_storage'],
  tiktok_events_api: ['ad_storage'],
};

/**
 * Given a user's consent signals, determines which server-side conversion
 * channels are eligible to receive this specific event.
 * @param {Object<string, boolean>} consentSignals - e.g. { ad_storage: true, analytics_storage: false }
 * @param {string[]} [availableChannels] - defaults to all known channels
 * @returns {{eligible: string[], blocked: Array<{channel: string, missingConsent: string[]}>}}
 */
function mapConsentToChannels(consentSignals, availableChannels = Object.keys(CHANNEL_CONSENT_REQUIREMENTS)) {
  if (!consentSignals || typeof consentSignals !== 'object') throw new Error('consentSignals must be an object.');

  const eligible = [];
  const blocked = [];

  for (const channel of availableChannels) {
    const required = CHANNEL_CONSENT_REQUIREMENTS[channel];
    if (!required) throw new Error(`Unknown channel "${channel}". Known channels: ${Object.keys(CHANNEL_CONSENT_REQUIREMENTS).join(', ')}`);

    const missingConsent = required.filter((r) => !consentSignals[r]);
    if (missingConsent.length === 0) {
      eligible.push(channel);
    } else {
      blocked.push({ channel, missingConsent });
    }
  }

  return { eligible, blocked };
}

module.exports = { fnv1a, generateEventId, validateDedupPair, mapConsentToChannels, CHANNEL_CONSENT_REQUIREMENTS, MAX_DEDUP_WINDOW_MS };
