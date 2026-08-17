/**
 * Duplicate Record Merge Resolver
 * MV3 Marketing — CRM & RevOps skill
 *
 * Detects likely-duplicate CRM records and computes a concrete, explainable
 * merge plan -- not just a similarity score. Two real problems this solves:
 *
 *   1. Duplicate detection needs multiple weak signals combined, not one
 *      strong one. Company name alone is noisy ("Acme Inc" vs "ACME,
 *      Incorporated"); domain alone misses companies without a domain on
 *      the record; phone alone misses shared switchboard numbers. This
 *      combines normalized string similarity (Jaro-Winkler, which is
 *      tuned for short strings like names and rewards matching prefixes
 *      more than plain Levenshtein does) across multiple fields into one
 *      weighted composite score.
 *   2. Once two records ARE the same real entity, merging them field by
 *      field needs real, consistent rules -- not "always keep record A."
 *      This applies explicit, documented precedence per field type
 *      (most-recently-updated wins, non-null beats null) and returns a
 *      field-by-field plan a human can review before executing.
 */

'use strict';

/**
 * Jaro-Winkler similarity: 0 (no similarity) to 1 (identical). Tuned for
 * short strings -- rewards a shared prefix more than plain edit distance,
 * which matters for names ("Robert" vs "Robrt") more than generic text.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function jaroWinklerSimilarity(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') throw new Error('Both arguments must be strings.');
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchDistance = Math.max(Math.floor(Math.max(s1.length, s2.length) / 2) - 1, 0);
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  transpositions = transpositions / 2;

  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions) / matches) / 3;

  // Winkler adjustment: boost score for a shared prefix, up to 4 characters.
  let prefixLength = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefixLength++;
    else break;
  }
  const winklerScale = 0.1;
  return Number((jaro + prefixLength * winklerScale * (1 - jaro)).toFixed(4));
}

const DEFAULT_FIELD_WEIGHTS = { companyName: 0.4, domain: 0.4, phone: 0.2 };

/**
 * @param {{companyName?: string, domain?: string, phone?: string}} recordA
 * @param {{companyName?: string, domain?: string, phone?: string}} recordB
 * @param {Object} [fieldWeights]
 * @returns {{compositeScore: number, fieldScores: Object<string, number|null>, isLikelyDuplicate: boolean}}
 */
function scoreDuplicateLikelihood(recordA, recordB, fieldWeights = DEFAULT_FIELD_WEIGHTS) {
  const totalWeight = Object.values(fieldWeights).reduce((sum, w) => sum + w, 0);
  if (Math.abs(totalWeight - 1) > 0.001) throw new Error(`fieldWeights must sum to 1, got ${totalWeight}.`);

  const fieldScores = {};
  let weightedSum = 0;
  let weightUsed = 0;

  for (const [field, weight] of Object.entries(fieldWeights)) {
    const valueA = recordA[field];
    const valueB = recordB[field];
    if (!valueA || !valueB) {
      fieldScores[field] = null; // cannot score a field missing on either side
      continue;
    }
    // Domain and phone are compared as normalized exact-ish strings via the
    // same similarity function -- a domain typo or formatting difference
    // still benefits from partial credit rather than an all-or-nothing match.
    const score = jaroWinklerSimilarity(String(valueA), String(valueB));
    fieldScores[field] = score;
    weightedSum += score * weight;
    weightUsed += weight;
  }

  if (weightUsed === 0) {
    throw new Error('No comparable fields present on both records -- cannot score duplicate likelihood.');
  }

  // Re-normalize over only the fields actually compared, so a record
  // missing one field isn't unfairly penalized against the full weight sum.
  const compositeScore = Number((weightedSum / weightUsed).toFixed(4));

  return { compositeScore, fieldScores, isLikelyDuplicate: compositeScore >= 0.85 };
}

/**
 * Computes a field-by-field merge plan between two records confirmed (by
 * the caller) to be duplicates. Precedence: non-null always beats null;
 * when both are non-null and differ, the more recently updated record's
 * value wins.
 * @param {Object} recordA
 * @param {Object} recordB
 * @param {string} updatedAtA - ISO timestamp
 * @param {string} updatedAtB - ISO timestamp
 * @returns {{survivingFields: Object, conflicts: Array<{field: string, keptValue: *, keptFrom: string, discardedValue: *}>}}
 */
function computeMergePlan(recordA, recordB, updatedAtA, updatedAtB) {
  if (!updatedAtA || !updatedAtB) throw new Error('Both updatedAtA and updatedAtB are required.');
  const aIsNewer = new Date(updatedAtA) >= new Date(updatedAtB);

  const allFields = new Set([...Object.keys(recordA), ...Object.keys(recordB)]);
  const survivingFields = {};
  const conflicts = [];

  for (const field of allFields) {
    const valueA = recordA[field];
    const valueB = recordB[field];
    const aPresent = valueA !== undefined && valueA !== null && valueA !== '';
    const bPresent = valueB !== undefined && valueB !== null && valueB !== '';

    if (aPresent && !bPresent) {
      survivingFields[field] = valueA;
    } else if (!aPresent && bPresent) {
      survivingFields[field] = valueB;
    } else if (!aPresent && !bPresent) {
      survivingFields[field] = null;
    } else if (valueA === valueB) {
      survivingFields[field] = valueA;
    } else {
      // Both present and differ -- most-recently-updated record wins, and
      // the discarded value is recorded, not silently dropped, so a human
      // can review the decision.
      const keptFrom = aIsNewer ? 'A' : 'B';
      const keptValue = aIsNewer ? valueA : valueB;
      const discardedValue = aIsNewer ? valueB : valueA;
      survivingFields[field] = keptValue;
      conflicts.push({ field, keptValue, keptFrom, discardedValue });
    }
  }

  return { survivingFields, conflicts };
}

module.exports = {
  jaroWinklerSimilarity,
  scoreDuplicateLikelihood,
  computeMergePlan,
  DEFAULT_FIELD_WEIGHTS,
};
