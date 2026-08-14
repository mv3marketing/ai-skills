/**
 * GEO Trust-Signal / Claim Provenance Auditor
 * MV3 Marketing — SEO / GEO / Content skill
 *
 * Real regex-based detection of numerically-specific claims (dollar
 * amounts, percentages, bulletin/model-code patterns) lacking inline
 * sourcing, plus Person schema completeness checks (name, jobTitle,
 * sameAs). Generalizes the same claim-guard pattern MV3 already runs
 * internally (the atvshop R-135 rule) into a portable, reusable skill.
 */

'use strict';

const CLAIM_PATTERNS = [
  { name: 'dollar_amount', regex: /\$[\d,]+(?:\.\d+)?(?:[kmb]|\s?(?:thousand|million|billion))?\b/gi },
  { name: 'percentage', regex: /\b\d+(?:\.\d+)?%/g },
  { name: 'bulletin_code', regex: /\b[A-Z]{1,3}-\d{2}-\d{2,3}\b/g }, // e.g. T-23-04, matches the atvshop R-135 pattern
  { name: 'specific_count', regex: /\b\d{2,}(?:,\d{3})*\+?\s*(?:customers|clients|users|companies|reviews|studies|cases)\b/gi },
];

const SOURCE_PROXIMITY_CHARS = 200; // how close an inline URL must be to count as "sourced"
const URL_PATTERN = /https?:\/\/[^\s)]+/g;

/**
 * @param {string} text
 * @returns {Array<{type: string, match: string, index: number, sourced: boolean}>}
 */
function detectClaims(text) {
  if (typeof text !== 'string') throw new Error('text must be a string.');

  const urlMatches = [...text.matchAll(URL_PATTERN)].map((m) => m.index);

  const claims = [];
  for (const { name, regex } of CLAIM_PATTERNS) {
    for (const m of text.matchAll(regex)) {
      const claimIndex = m.index;
      const sourced = urlMatches.some((urlIndex) => Math.abs(urlIndex - claimIndex) <= SOURCE_PROXIMITY_CHARS);
      claims.push({ type: name, match: m[0], index: claimIndex, sourced });
    }
  }
  claims.sort((a, b) => a.index - b.index);
  return claims;
}

/**
 * @param {string} text
 * @returns {{totalClaims: number, unsourcedClaims: number, claims: Array}}
 */
function auditClaimProvenance(text) {
  const claims = detectClaims(text);
  const unsourcedClaims = claims.filter((c) => !c.sourced).length;
  return { totalClaims: claims.length, unsourcedClaims, claims };
}

/**
 * Checks a Person schema object for completeness against the fields that
 * actually matter for GEO trust signals: name, jobTitle, and a non-empty
 * sameAs array (linking the person to verifiable external profiles).
 * @param {Object} personSchema
 * @returns {{complete: boolean, issues: string[]}}
 */
function auditPersonSchema(personSchema) {
  if (!personSchema || typeof personSchema !== 'object') throw new Error('personSchema must be an object.');
  const issues = [];

  if (!personSchema.name || String(personSchema.name).trim() === '') {
    issues.push('Missing "name".');
  }
  if (!personSchema.jobTitle || String(personSchema.jobTitle).trim() === '') {
    issues.push('Missing "jobTitle".');
  }
  if (!Array.isArray(personSchema.sameAs) || personSchema.sameAs.length === 0) {
    issues.push('Missing or empty "sameAs" array - no verifiable external profile links.');
  } else {
    const invalidLinks = personSchema.sameAs.filter((url) => !/^https?:\/\//.test(url));
    if (invalidLinks.length > 0) {
      issues.push(`"sameAs" contains ${invalidLinks.length} entr(y/ies) that are not valid URLs.`);
    }
  }

  return { complete: issues.length === 0, issues };
}

module.exports = { detectClaims, auditClaimProvenance, auditPersonSchema, CLAIM_PATTERNS };
