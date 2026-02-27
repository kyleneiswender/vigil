/**
 * Vulnerability Scoring Engine
 *
 * Composite risk score weights:
 *   Asset Criticality:    25%
 *   Affected Asset Count: 20%  (log10 scale, ceiling = 1000 hosts)
 *   CVSS Base Score:      20%
 *   Internet Exposure:    15%
 *   Exploitability:       15%
 *   Days Since Discovery:  5%
 *
 * Each factor is normalized to 0–100 before weights are applied.
 * Final score is 0–100; mapped to a risk tier.
 */

// --- Normalization helpers ---

/**
 * Normalize CVSS base score (0–10) → 0–100.
 */
export function normalizeCvss(cvss) {
  const val = Math.max(0, Math.min(10, Number(cvss) || 0));
  return val * 10;
}

/**
 * Normalize asset criticality string → 0–100.
 * Low=25, Medium=50, High=75, Critical=100
 */
export function normalizeAssetCriticality(criticality) {
  const map = {
    Low: 25,
    Medium: 50,
    High: 75,
    Critical: 100,
  };
  return map[criticality] ?? 0;
}

/**
 * Normalize internet-facing boolean → 0–100.
 * false=0, true=100
 */
export function normalizeInternetExposure(internetFacing) {
  return internetFacing ? 100 : 0;
}

/**
 * Normalize exploitability string → 0–100.
 * Theoretical=25, PoC Exists=60, Actively Exploited=100
 */
export function normalizeExploitability(exploitability) {
  const map = {
    Theoretical: 25,
    'PoC Exists': 60,
    'Actively Exploited': 100,
  };
  return map[exploitability] ?? 0;
}

/**
 * Normalize days since discovery → 0–100.
 * Capped at 365 days (1 year = max urgency from age).
 */
export function normalizeDays(days) {
  const val = Math.max(0, Number(days) || 0);
  return Math.min(val / 365, 1) * 100;
}

/**
 * Normalize affected asset count → 0–100 on a logarithmic scale.
 * Ceiling is 1000 hosts (log10(1001) ≈ 3.0004).
 * Log scale means 1→10 hosts is weighted more heavily than 200→210.
 * Examples: 0=0, 1≈10, 10≈35, 100≈67, 1000=100
 *
 * @param {number} count - Number of affected assets (≥ 0)
 * @returns {number} Normalized score 0–100
 */
export function normalizeAffectedAssetCount(count) {
  const val = Math.max(0, Number(count) || 0);
  const LOG10_CEILING = Math.log10(1001); // log10(1000 + 1)
  return Math.min(Math.log10(val + 1) / LOG10_CEILING, 1) * 100;
}

// --- Composite score ---

/**
 * Calculate the composite risk score (0–100) for a vulnerability.
 *
 * @param {Object} vuln - Vulnerability data object
 * @param {number} vuln.cvssScore            - CVSS base score (0–10)
 * @param {string} vuln.assetCriticality     - 'Low' | 'Medium' | 'High' | 'Critical'
 * @param {boolean} vuln.internetFacing      - true if internet-facing
 * @param {string} vuln.exploitability       - 'Theoretical' | 'PoC Exists' | 'Actively Exploited'
 * @param {number} vuln.daysSinceDiscovery   - Number of days since discovery
 * @param {number} vuln.affectedAssetCount   - Number of affected hosts/assets
 * @returns {number} Composite score rounded to one decimal place
 */
export function calculateCompositeScore(vuln) {
  const scores = {
    criticality: normalizeAssetCriticality(vuln.assetCriticality),
    assetCount: normalizeAffectedAssetCount(vuln.affectedAssetCount),
    cvss: normalizeCvss(vuln.cvssScore),
    exposure: normalizeInternetExposure(vuln.internetFacing),
    exploitability: normalizeExploitability(vuln.exploitability),
    days: normalizeDays(vuln.daysSinceDiscovery),
  };

  const composite =
    scores.criticality  * 0.25 +
    scores.assetCount   * 0.20 +
    scores.cvss         * 0.20 +
    scores.exposure     * 0.15 +
    scores.exploitability * 0.15 +
    scores.days         * 0.05;

  return Math.round(composite * 10) / 10;
}

// --- Risk tier mapping ---

/**
 * Map a composite score to a named risk tier.
 * Critical: 80–100, High: 60–79, Medium: 40–59, Low: 0–39
 *
 * @param {number} score - Composite score (0–100)
 * @returns {{ tier: string, color: string, bg: string, border: string }}
 */
export function getRiskTier(score) {
  if (score >= 80) {
    return {
      tier: 'Critical',
      color: 'text-red-800',
      bg: 'bg-red-50',
      border: 'border-red-200',
      badge: 'bg-red-600 text-white',
    };
  }
  if (score >= 60) {
    return {
      tier: 'High',
      color: 'text-orange-800',
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      badge: 'bg-orange-500 text-white',
    };
  }
  if (score >= 40) {
    return {
      tier: 'Medium',
      color: 'text-yellow-800',
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      badge: 'bg-yellow-400 text-yellow-900',
    };
  }
  return {
    tier: 'Low',
    color: 'text-green-800',
    bg: 'bg-green-50',
    border: 'border-green-200',
    badge: 'bg-green-500 text-white',
  };
}

/**
 * Score and annotate a vulnerability object.
 * Returns a new object with compositeScore and riskTier added.
 */
export function scoreVulnerability(vuln) {
  const compositeScore = calculateCompositeScore(vuln);
  const riskTier = getRiskTier(compositeScore);
  return { ...vuln, compositeScore, riskTier };
}
