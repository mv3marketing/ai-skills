/**
 * AI-Persona / Author-Entity Consistency Auditor
 * MV3 Marketing — SEO / GEO / Content skill
 *
 * Directly generalizes real problems this exact codebase has hit: the
 * same photo used for two different named personas, byline title drift
 * for the same persona across pages, and thin bios sitewide. Catches
 * these with real set/group-by logic, not a manual sweep.
 */

'use strict';

const MIN_BIO_WORDS = 15;

/**
 * @param {Array<{personaId: string, name: string, photoHash: string}>} personas
 * @returns {Array<{photoHash: string, personaIds: string[], names: string[]}>} groups sharing a photoHash across 2+ DISTINCT personas
 */
function detectDuplicatePhotos(personas) {
  if (!Array.isArray(personas) || personas.length === 0) throw new Error('personas must be a non-empty array.');
  const byPhoto = new Map();
  for (const p of personas) {
    if (!p.photoHash) throw new Error(`Persona ${p.personaId} is missing photoHash.`);
    if (!byPhoto.has(p.photoHash)) byPhoto.set(p.photoHash, new Set());
    byPhoto.get(p.photoHash).add(p.personaId);
  }

  const findings = [];
  for (const [photoHash, personaIdSet] of byPhoto.entries()) {
    if (personaIdSet.size > 1) {
      const personaIds = [...personaIdSet];
      const names = personas.filter((p) => personaIds.includes(p.personaId)).map((p) => p.name);
      findings.push({ photoHash, personaIds, names: [...new Set(names)] });
    }
  }
  return findings;
}

/**
 * @param {Array<{personaId: string, name: string, title: string, pageUrl: string}>} pageRecords - one row per page where this persona appears as an author/byline
 * @returns {Array<{personaId: string, name: string, titlesFound: string[], pages: string[]}>} personas whose byline title is not consistent across pages
 */
function detectTitleDrift(pageRecords) {
  if (!Array.isArray(pageRecords) || pageRecords.length === 0) throw new Error('pageRecords must be a non-empty array.');
  const byPersona = new Map();
  for (const r of pageRecords) {
    if (!r.personaId) throw new Error('Every pageRecord needs a personaId.');
    if (!byPersona.has(r.personaId)) byPersona.set(r.personaId, { name: r.name, titles: new Map() });
    const entry = byPersona.get(r.personaId);
    if (!entry.titles.has(r.title)) entry.titles.set(r.title, []);
    entry.titles.get(r.title).push(r.pageUrl);
  }

  const findings = [];
  for (const [personaId, { name, titles }] of byPersona.entries()) {
    if (titles.size > 1) {
      findings.push({
        personaId,
        name,
        titlesFound: [...titles.keys()],
        pages: [...titles.values()].flat(),
      });
    }
  }
  return findings;
}

/**
 * @param {Array<{personaId: string, name: string, bio: string}>} personas
 * @returns {Array<{personaId: string, name: string, wordCount: number}>} personas with a bio under MIN_BIO_WORDS
 */
function detectThinBios(personas) {
  if (!Array.isArray(personas) || personas.length === 0) throw new Error('personas must be a non-empty array.');
  const findings = [];
  for (const p of personas) {
    const wordCount = (p.bio || '').trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < MIN_BIO_WORDS) {
      findings.push({ personaId: p.personaId, name: p.name, wordCount });
    }
  }
  return findings;
}

/**
 * Runs all three checks and returns a combined report.
 */
function auditPersonaConsistency({ personas, pageRecords }) {
  return {
    duplicatePhotos: detectDuplicatePhotos(personas),
    titleDrift: detectTitleDrift(pageRecords),
    thinBios: detectThinBios(personas),
  };
}

module.exports = { detectDuplicatePhotos, detectTitleDrift, detectThinBios, auditPersonaConsistency, MIN_BIO_WORDS };
