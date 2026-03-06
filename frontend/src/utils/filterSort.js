/**
 * Filter and sort utilities for the vulnerability results table.
 * All functions are pure — no side effects, no React dependencies.
 */

// ─── Filtering ────────────────────────────────────────────────────────────────

/**
 * Filter a vulnerability array by the given filter criteria.
 *
 * @param {object[]} vulns
 * @param {{ search: string, riskTier: string, assetCriticality: string, internetFacing: string }} filters
 *   internetFacing: '' = all, 'yes' = internet-facing, 'no' = internal only
 * @returns {object[]}
 */
export function filterVulns(vulns, { search, riskTier, assetCriticality, internetFacing }) {
  return vulns.filter((v) => {
    if (search) {
      const q = search.toLowerCase();
      if (!v.cveId.toLowerCase().includes(q) && !v.title.toLowerCase().includes(q)) return false;
    }
    if (riskTier && v.riskTier.tier !== riskTier) return false;
    if (assetCriticality && v.assetCriticality !== assetCriticality) return false;
    if (internetFacing === 'yes' && !v.internetFacing) return false;
    if (internetFacing === 'no' && v.internetFacing) return false;
    return true;
  });
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

/**
 * Ordinal ranks for fields that aren't naturally numeric.
 * Higher rank = sorts higher in descending order.
 */
const TIER_RANK = { Critical: 3, High: 2, Medium: 1, Low: 0 };
const CRITICALITY_RANK = { Critical: 3, High: 2, Medium: 1, Low: 0 };
const EXPLOIT_RANK = { 'Actively Exploited': 2, 'PoC Exists': 1, Theoretical: 0 };

/**
 * Sort a vulnerability array.
 *
 * Categorical fields (riskTier, assetCriticality, exploitability, internetFacing)
 * are converted to ordinal ranks so they sort meaningfully rather than lexicographically.
 *
 * @param {object[]} vulns
 * @param {string}   sortKey - Field key to sort by
 * @param {'asc'|'desc'} sortDir
 * @returns {object[]} New sorted array (original is not mutated)
 */
export function sortVulns(vulns, sortKey, sortDir) {
  if (!sortKey) return vulns;
  const dir = sortDir === 'asc' ? 1 : -1;

  return [...vulns].sort((a, b) => {
    let av, bv;

    switch (sortKey) {
      case 'riskTier':
        av = TIER_RANK[a.riskTier.tier] ?? -1;
        bv = TIER_RANK[b.riskTier.tier] ?? -1;
        break;
      case 'assetCriticality':
        av = CRITICALITY_RANK[a.assetCriticality] ?? -1;
        bv = CRITICALITY_RANK[b.assetCriticality] ?? -1;
        break;
      case 'exploitability':
        av = EXPLOIT_RANK[a.exploitability] ?? -1;
        bv = EXPLOIT_RANK[b.exploitability] ?? -1;
        break;
      case 'internetFacing':
        av = a.internetFacing ? 1 : 0;
        bv = b.internetFacing ? 1 : 0;
        break;
      default:
        av = a[sortKey];
        bv = b[sortKey];
    }

    if (typeof av === 'string') return dir * av.localeCompare(bv);
    return dir * ((av ?? 0) - (bv ?? 0));
  });
}
