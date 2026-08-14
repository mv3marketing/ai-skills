/**
 * Deliverability Health Diagnostic
 * MV3 Marketing — Email / Automation skill
 *
 * Real SPF/DKIM/DMARC TXT record SYNTAX parsing (not just presence
 * booleans), plus a real linear-regression trend read on bounce/complaint
 * history against Google/Yahoo's 2024 bulk-sender policy thresholds.
 */

'use strict';

const SAFE_BOUNCE_RATE = 0.02;
const SAFE_COMPLAINT_RATE = 0.003;

/**
 * Parses a raw SPF TXT record. Real RFC 7208 rules: must start with
 * "v=spf1", counts DNS-lookup mechanisms (include/a/mx/ptr/exists) against
 * the real 10-lookup limit, and checks for a terminal "all" mechanism.
 */
function parseSpf(record) {
  if (typeof record !== 'string' || record.trim() === '') {
    return { present: false, valid: false, issues: ['No SPF record found.'], lookupCount: 0 };
  }
  const issues = [];
  const trimmed = record.trim();

  if (!trimmed.startsWith('v=spf1')) {
    return { present: true, valid: false, issues: ['Record does not start with "v=spf1".'], lookupCount: 0 };
  }

  const terms = trimmed.split(/\s+/).slice(1);
  const lookupMechanisms = ['include:', 'a:', 'a', 'mx:', 'mx', 'ptr:', 'ptr', 'exists:'];
  let lookupCount = 0;
  let hasAllTerm = false;
  let allQualifier = null;

  for (const term of terms) {
    const bare = term.replace(/^[+\-~?]/, '');
    const qualifier = /^[+\-~?]/.test(term) ? term[0] : '+';

    if (bare === 'all') {
      hasAllTerm = true;
      allQualifier = qualifier;
      continue;
    }
    if (lookupMechanisms.some((m) => bare === m || bare.startsWith(m))) {
      lookupCount++;
    }
  }

  if (!hasAllTerm) {
    issues.push('No terminal "all" mechanism found - defaults to an implicit permissive allow, which is a real risk.');
  } else if (allQualifier === '+') {
    issues.push('Uses "+all" (or unqualified "all"), which explicitly allows any server to send as this domain. Should be "-all" or "~all".');
  } else if (allQualifier === '?') {
    issues.push('Uses "?all" (neutral), which provides no real protection.');
  }

  if (lookupCount > 10) {
    issues.push(`${lookupCount} DNS-lookup mechanisms found, exceeding RFC 7208's 10-lookup limit. Receiving servers may treat this as a permanent SPF failure.`);
  }

  return { present: true, valid: issues.length === 0, issues, lookupCount };
}

/**
 * Parses a raw DKIM TXT record (the value at the selector._domainkey subdomain).
 */
function parseDkim(record) {
  if (typeof record !== 'string' || record.trim() === '') {
    return { present: false, valid: false, issues: ['No DKIM record found at the given selector.'] };
  }
  const issues = [];
  const fields = {};
  for (const part of record.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key) fields[key.trim()] = rest.join('=').trim();
  }

  if (fields.v !== 'DKIM1') issues.push('Missing or incorrect "v=DKIM1" tag.');
  if (fields.p === undefined) {
    issues.push('Missing "p=" public key tag.');
  } else if (fields.p === '') {
    issues.push('Empty "p=" tag - this key has been explicitly revoked.');
  }
  if (fields.k && !['rsa', 'ed25519'].includes(fields.k)) {
    issues.push(`Unrecognized key algorithm "k=${fields.k}".`);
  }

  return { present: true, valid: issues.length === 0, issues, fields };
}

/**
 * Parses a raw DMARC TXT record (at _dmarc.domain).
 */
function parseDmarc(record) {
  if (typeof record !== 'string' || record.trim() === '') {
    return { present: false, valid: false, issues: ['No DMARC record found.'] };
  }
  const issues = [];
  const fields = {};
  for (const part of record.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key) fields[key.trim()] = rest.join('=').trim();
  }

  if (fields.v !== 'DMARC1') issues.push('Missing or incorrect "v=DMARC1" tag.');
  if (!fields.p || !['none', 'quarantine', 'reject'].includes(fields.p)) {
    issues.push(`Missing or invalid "p=" policy tag (found "${fields.p}").`);
  } else if (fields.p === 'none') {
    issues.push('Policy is "p=none" - monitoring only, no real enforcement. 2024 bulk-sender guidance recommends at least "quarantine".');
  }
  if (fields.pct !== undefined) {
    const pct = Number(fields.pct);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) issues.push(`Invalid "pct=" value "${fields.pct}" (must be 0-100).`);
  }

  return { present: true, valid: issues.length === 0, issues, fields };
}

/**
 * Real linear-regression trend on daily bounce/complaint rate history:
 * fits a least-squares line and returns the slope, so a marketer can see
 * whether deliverability is trending better or worse, not just today's
 * snapshot number.
 * @param {Array<{day: number, rate: number}>} history - day is a simple 0,1,2... index
 */
function trendSlope(history) {
  if (!Array.isArray(history) || history.length < 2) {
    throw new Error('trendSlope requires at least 2 data points.');
  }
  const n = history.length;
  const xMean = history.reduce((s, h) => s + h.day, 0) / n;
  const yMean = history.reduce((s, h) => s + h.rate, 0) / n;
  let num = 0;
  let den = 0;
  for (const h of history) {
    num += (h.day - xMean) * (h.rate - yMean);
    den += (h.day - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Full diagnostic: parses all three records and reads the bounce/complaint
 * trend, returning an overall verdict.
 */
function diagnose({ spfRecord, dkimRecord, dmarcRecord, bounceHistory, complaintHistory }) {
  const spf = parseSpf(spfRecord);
  const dkim = parseDkim(dkimRecord);
  const dmarc = parseDmarc(dmarcRecord);

  const bounceTrend = bounceHistory && bounceHistory.length >= 2 ? trendSlope(bounceHistory) : null;
  const complaintTrend = complaintHistory && complaintHistory.length >= 2 ? trendSlope(complaintHistory) : null;

  const currentBounceRate = bounceHistory && bounceHistory.length > 0 ? bounceHistory[bounceHistory.length - 1].rate : null;
  const currentComplaintRate = complaintHistory && complaintHistory.length > 0 ? complaintHistory[complaintHistory.length - 1].rate : null;

  const allAuthValid = spf.valid && dkim.valid && dmarc.valid;
  const ratesHealthy = (currentBounceRate === null || currentBounceRate <= SAFE_BOUNCE_RATE)
    && (currentComplaintRate === null || currentComplaintRate <= SAFE_COMPLAINT_RATE);

  return {
    spf, dkim, dmarc,
    bounceTrend, complaintTrend,
    healthy: allAuthValid && ratesHealthy,
  };
}

module.exports = { parseSpf, parseDkim, parseDmarc, trendSlope, diagnose, SAFE_BOUNCE_RATE, SAFE_COMPLAINT_RATE };
