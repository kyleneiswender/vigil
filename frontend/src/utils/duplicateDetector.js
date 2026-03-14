import { CLOSED_STATUSES } from './scoringEngine.js';

/**
 * Returns the first vulnerability in the list whose CVE ID matches (case-insensitive),
 * or null if none found.
 */
export function findDuplicateCve(cveId, vulnerabilities) {
  if (!cveId) return null;
  const normalized = cveId.toUpperCase().trim();
  return vulnerabilities.find(
    (v) => v.cveId?.toUpperCase().trim() === normalized
  ) ?? null;
}

/**
 * Returns true if the duplicate record's status is a closed status,
 * enabling the "Reopen Existing Record" flow.
 */
export function isDuplicateClosed(duplicate) {
  if (!duplicate) return false;
  return CLOSED_STATUSES.includes(duplicate.status);
}
