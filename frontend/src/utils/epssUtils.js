/**
 * EPSS display formatting utilities.
 *
 * EPSS (Exploit Prediction Scoring System) values are decimals in [0, 1].
 * These functions convert them to human-readable strings for the UI.
 */

/**
 * Format an EPSS score (0–1) as a percentage with two decimal places.
 *
 * @param {number|null} score - EPSS probability score
 * @returns {string} e.g. '94.32%' or 'Not available'
 */
export function formatEpssScore(score) {
  if (score === null || score === undefined) return 'Not available';
  return `${(score * 100).toFixed(2)}%`;
}

/**
 * Format an EPSS percentile (0–1) as a "Top X.X%" string.
 * A percentile of 0.9712 means the CVE scores higher than 97.12% of all
 * scored CVEs, placing it in the top 2.88% ≈ top 2.9%.
 *
 * @param {number|null} percentile - EPSS percentile ranking
 * @returns {string} e.g. 'Top 2.9%' or 'Not available'
 */
export function formatEpssPercentile(percentile) {
  if (percentile === null || percentile === undefined) return 'Not available';
  return `Top ${((1 - percentile) * 100).toFixed(1)}%`;
}
