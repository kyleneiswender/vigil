/**
 * Vulnerability Scoring Engine
 *
 * Default composite risk score weights (integer percentages summing to 100):
 *   Asset Criticality:    25%
 *   CVSS Base Score:      20%
 *   Affected Asset Count: 15%  (log10 scale, ceiling = 1000 hosts)
 *   Internet Exposure:    15%
 *   Exploitability:       10%
 *   EPSS Score:           10%  (0–1 probability → 0–100)
 *   Days Since Discovery:  5%
 *
 * Each factor is normalized to 0–100 before weights are applied.
 * Final score is 0–100; mapped to a risk tier.
 *
 * calculateCompositeScore() and scoreVulnerability() both accept an optional
 * `weights` argument so the UI can recalculate scores live when the user
 * adjusts the weight configuration panel.
 */

// ─── Vulnerability status constants ───────────────────────────────────────────

/**
 * All valid status values for a vulnerability, in display/workflow order.
 * Status is stored as a plain text field; the frontend enforces these values.
 */
export const VULNERABILITY_STATUSES = [
  'Open',
  'In Progress',
  'Remediated',
  'Accepted Risk',
  'False Positive',
  'Risk Re-opened',
];

/**
 * Statuses that indicate a vulnerability is no longer actively being worked.
 * Records in these statuses are excluded from the default "active" filter view.
 * Note: 'Risk Re-opened' is intentionally NOT here — it is an active status.
 */
export const CLOSED_STATUSES = ['Remediated', 'Accepted Risk', 'False Positive'];

// ─── Weight model ─────────────────────────────────────────────────────────────

/**
 * Default weights as integer percentages. Must sum to 100.
 * Keys match the `scores` object keys inside calculateCompositeScore.
 */
export const DEFAULT_WEIGHTS = {
  criticality:   25,
  cvss:          20,
  assetCount:    15,
  exposure:      15,
  exploitability: 10,
  epss:          10,
  days:           5,
};

/** Human-readable labels for each weight key, used in WeightConfig and PDF export. */
export const WEIGHT_LABELS = {
  criticality:   'Asset Criticality',
  cvss:          'CVSS v3 Base Score',
  assetCount:    'Affected Asset Count',
  exposure:      'Internet Exposure',
  exploitability: 'Exploitability',
  epss:          'EPSS Score',
  days:          'Days Since Discovery',
};

/**
 * Adjust one weight slider and proportionally redistribute the difference
 * across the remaining factors so the total always equals 100.
 *
 * Uses largest-remainder (Hare) rounding to prevent integer drift.
 *
 * @param {object} weights    - Current integer weight map
 * @param {string} changedKey - The key whose slider was moved
 * @param {number} newRaw     - The new value for changedKey (will be clamped 0–100)
 * @returns {object} New weight map guaranteed to sum to 100
 */
export function redistributeWeights(weights, changedKey, newRaw) {
  const newValue = Math.max(0, Math.min(100, Math.round(Number(newRaw))));
  const otherKeys = Object.keys(weights).filter((k) => k !== changedKey);
  const othersTotal = otherKeys.reduce((s, k) => s + weights[k], 0);
  const remainingTarget = 100 - newValue;
  const result = { ...weights, [changedKey]: newValue };

  if (othersTotal === 0) {
    // Edge case: all other weights are 0 — distribute evenly
    const base = Math.floor(remainingTarget / otherKeys.length);
    let leftover = remainingTarget - base * otherKeys.length;
    otherKeys.forEach((k) => {
      result[k] = base + (leftover-- > 0 ? 1 : 0);
    });
  } else {
    // Scale proportionally then apply Hare rounding
    const floats = otherKeys.map((k) => ({
      key: k,
      float: (weights[k] / othersTotal) * remainingTarget,
    }));
    const floored = floats.map(({ key, float }) => ({
      key,
      floor: Math.floor(float),
      frac: float - Math.floor(float),
    }));
    const floorSum = floored.reduce((s, { floor }) => s + floor, 0);
    let leftover = remainingTarget - floorSum;
    // Give leftover to the entries with the largest fractional parts
    floored.sort((a, b) => b.frac - a.frac);
    floored.forEach(({ key, floor }) => {
      result[key] = floor + (leftover-- > 0 ? 1 : 0);
    });
  }

  return result;
}

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

/**
 * Normalize EPSS score (0–1 probability) → 0–100.
 * Null or undefined (no EPSS data) returns 0 — absence of data is not penalized
 * in other factors; the EPSS component simply contributes nothing.
 *
 * @param {number|null|undefined} epssScore - EPSS exploitation probability
 * @returns {number} Normalized score 0–100
 */
export function normalizeEpss(epssScore) {
  if (epssScore === null || epssScore === undefined) return 0;
  const val = parseFloat(epssScore);
  if (isNaN(val)) return 0;
  return Math.min(Math.max(val, 0), 1) * 100;
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
 * @param {number|null} vuln.epssScore       - EPSS score 0–1, or null if unavailable
 * @param {object} [weights]                 - Integer weight map (default: DEFAULT_WEIGHTS)
 * @returns {number} Composite score rounded to one decimal place
 */
export function calculateCompositeScore(vuln, weights = DEFAULT_WEIGHTS) {
  // KEV override: if the CVE is in the CISA Known Exploited Vulnerabilities catalog,
  // always score exploitability at the maximum level regardless of the dropdown value.
  const effectiveExploitability = vuln.isKev ? 'Actively Exploited' : vuln.exploitability;

  const scores = {
    criticality:   normalizeAssetCriticality(vuln.assetCriticality),
    assetCount:    normalizeAffectedAssetCount(vuln.affectedAssetCount),
    cvss:          normalizeCvss(vuln.cvssScore),
    exposure:      normalizeInternetExposure(vuln.internetFacing),
    exploitability: normalizeExploitability(effectiveExploitability),
    days:          normalizeDays(vuln.daysSinceDiscovery),
    epss:          normalizeEpss(vuln.epssScore),
  };

  const composite =
    scores.criticality    * (weights.criticality    / 100) +
    scores.assetCount     * (weights.assetCount     / 100) +
    scores.cvss           * (weights.cvss           / 100) +
    scores.exposure       * (weights.exposure       / 100) +
    scores.exploitability * (weights.exploitability / 100) +
    scores.epss           * (weights.epss           / 100) +
    scores.days           * (weights.days           / 100);

  return Math.round(composite * 10) / 10;
}

// --- Risk tier mapping ---

/**
 * Single source-of-truth for tier → Tailwind CSS class mapping.
 * Used by getRiskTier and display components (VulnTable score bar, badges).
 */
export const TIER_COLORS = {
  Critical: {
    color:  'text-red-800',
    bg:     'bg-red-50',
    border: 'border-red-200',
    badge:  'bg-red-600 text-white',
    bar:    'bg-red-500',
  },
  High: {
    color:  'text-orange-800',
    bg:     'bg-orange-50',
    border: 'border-orange-200',
    badge:  'bg-orange-500 text-white',
    bar:    'bg-orange-500',
  },
  Medium: {
    color:  'text-yellow-800',
    bg:     'bg-yellow-50',
    border: 'border-yellow-200',
    badge:  'bg-yellow-400 text-yellow-900',
    bar:    'bg-yellow-400',
  },
  Low: {
    color:  'text-green-800',
    bg:     'bg-green-50',
    border: 'border-green-200',
    badge:  'bg-green-500 text-white',
    bar:    'bg-green-500',
  },
};

/**
 * Map a composite score to a named risk tier.
 *
 * @param {number} score - Composite score (0–100)
 * @param {{ critical?: number, high?: number, medium?: number }} [thresholds]
 *   Optional org-level threshold overrides. Defaults: critical=80, high=60, medium=40.
 * @returns {{ tier: string, color: string, bg: string, border: string, badge: string, bar: string }}
 */
export function getRiskTier(score, thresholds = {}) {
  const critical = thresholds.critical ?? 80;
  const high     = thresholds.high     ?? 60;
  const medium   = thresholds.medium   ?? 40;

  const tier = score >= critical ? 'Critical'
             : score >= high     ? 'High'
             : score >= medium   ? 'Medium'
             : 'Low';

  return { tier, ...TIER_COLORS[tier] };
}

/**
 * Resolve scoring weights using the priority order:
 *   savedWeights (user's persisted record) → orgDefaultWeights → DEFAULT_WEIGHTS
 *
 * @param {object|null} savedWeights      - User's scoring_weights PocketBase record (or null)
 * @param {object|null} orgDefaultWeights - Org-level default weights from org_settings (or null)
 * @returns {object} Resolved integer weight map guaranteed to sum to 100
 */
export function resolveWeights(savedWeights, orgDefaultWeights) {
  if (savedWeights) return savedWeights;
  if (orgDefaultWeights) return { ...orgDefaultWeights };
  return { ...DEFAULT_WEIGHTS };
}

/**
 * Score and annotate a vulnerability object.
 * Returns a new object with compositeScore and riskTier added.
 *
 * @param {object} vuln          - Raw vulnerability data
 * @param {object} [weights]     - Integer weight map (default: DEFAULT_WEIGHTS)
 * @param {object} [thresholds]  - Risk tier thresholds (default: 80/60/40)
 */
export function scoreVulnerability(vuln, weights = DEFAULT_WEIGHTS, thresholds = {}) {
  const compositeScore = calculateCompositeScore(vuln, weights);
  const riskTier = getRiskTier(compositeScore, thresholds);
  return {
    ...vuln,
    compositeScore,
    riskTier,
    epssScore:      vuln.epssScore      ?? null,
    epssPercentile: vuln.epssPercentile ?? null,
    isKev:          vuln.isKev          ?? false,
    kevDateAdded:   vuln.kevDateAdded   ?? null,
  };
}
