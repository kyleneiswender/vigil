/**
 * api.js — all PocketBase data operations for the vulnerability prioritization tool.
 *
 * Every function that mutates data also writes an audit log entry. The caller
 * is responsible for passing the correct organizationId (taken from the
 * authenticated user's `organization` field).
 */

import { pb, getCurrentUser } from './pocketbase.js';
import { CLOSED_STATUSES } from '../utils/scoringEngine.js';

// ─── User initialisation ──────────────────────────────────────────────────────

// Cached organization ID — populated by initializeUser() after every login.
let currentOrgId = null;

/**
 * Reads the authenticated user's organization ID from the already-refreshed
 * auth store record and caches it in `currentOrgId`.
 *
 * Must be called AFTER pb.authStore has been populated by authRefresh() or
 * authWithPassword(). Both of those calls fetch the full user record from the
 * database — including the `organization` relation field as a string ID — so
 * no additional round-trip is needed here.
 *
 * @returns {string|null} the organization ID, or null if unassigned
 */
export function initializeUser() {
  const user = pb.authStore.model;
  if (!user?.id) {
    currentOrgId = null;
    return null;
  }
  // Use || null so an empty string '' (unset relation) is treated the same as null.
  currentOrgId = user.organization || null;
  if (currentOrgId) sessionStorage.setItem('pb_org_id', currentOrgId);
  return currentOrgId;
}

// ─── Vulnerabilities ──────────────────────────────────────────────────────────

/**
 * Fetch all vulnerabilities for the given organization, sorted by composite
 * score descending.
 */
export async function fetchVulnerabilities(organizationId) {
  const records = await pb.collection('vulnerabilities').getFullList({
    filter: `organization = "${organizationId}"`,
    sort: '-compositeScore',
    expand: 'group,assigned_to',
    requestKey: null, // prevent StrictMode double-invocation from auto-cancelling
  });
  return records.map(mapRecord);
}

/**
 * Create a new vulnerability record and write a creation audit log entry.
 * @param {object} vuln  - scored vulnerability object (from scoreVulnerability)
 * @param {string} organizationId
 * @returns {Promise<object>} the created PocketBase record
 */
export async function createVulnerability(vuln, organizationId) {
  const effectiveOrgId = organizationId || currentOrgId || sessionStorage.getItem('pb_org_id');
  const data = {
    cveId:               vuln.cveId,
    title:               vuln.title ?? '',
    cvssScore:           vuln.cvssScore,
    assetCriticality:    vuln.assetCriticality,
    internetFacing:      vuln.internetFacing,
    exploitability:      vuln.exploitability,
    daysSinceDiscovery:  vuln.daysSinceDiscovery,
    affectedAssetCount:  vuln.affectedAssetCount,
    compositeScore:      vuln.compositeScore,
    riskTier:            vuln.riskTier?.tier ?? vuln.riskTier ?? '',
    epssScore:           vuln.epssScore      ?? null,
    epssPercentile:      vuln.epssPercentile ?? null,
    status:              'Open',
    organization:        effectiveOrgId,
  };
  // requestKey: null disables auto-cancellation so parallel creates (bulk CSV import) all complete
  const record = await pb.collection('vulnerabilities').create(data, { requestKey: null });

  await _writeVulnAudit({
    vulnerability:  record.id,
    action:         'create',
    changedFields:  Object.keys(vuln),
    previousValues: null,
    newValues:      _vulnSnapshot(record),
    organizationId: effectiveOrgId,
  });

  return mapRecord(record);
}

/**
 * Update an existing vulnerability and write an update audit log entry.
 * @param {string} id   - PocketBase record ID
 * @param {object} vuln - scored vulnerability object
 * @param {string} organizationId
 * @returns {Promise<object>} the updated PocketBase record
 */
export async function updateVulnerability(id, vuln, organizationId) {
  const previous = await pb.collection('vulnerabilities').getOne(id);
  const effectiveOrgId = organizationId || currentOrgId || sessionStorage.getItem('pb_org_id');
  const updates = {
    cveId:               vuln.cveId,
    title:               vuln.title ?? '',
    cvssScore:           vuln.cvssScore,
    assetCriticality:    vuln.assetCriticality,
    internetFacing:      vuln.internetFacing,
    exploitability:      vuln.exploitability,
    daysSinceDiscovery:  vuln.daysSinceDiscovery,
    affectedAssetCount:  vuln.affectedAssetCount,
    compositeScore:      vuln.compositeScore,
    riskTier:            vuln.riskTier?.tier ?? vuln.riskTier ?? '',
    epssScore:           vuln.epssScore      ?? null,
    epssPercentile:      vuln.epssPercentile ?? null,
    organization:        effectiveOrgId,
    group:               vuln.group       || null,
    assigned_to:         vuln.assignedTo  || null,
  };

  const record = await pb.collection('vulnerabilities').update(id, updates, {
    expand: 'group,assigned_to',
  });

  const changedFields = Object.keys(updates).filter(
    (k) => updates[k] !== previous[k]
  );

  if (changedFields.length > 0) {
    await _writeVulnAudit({
      vulnerability:  id,
      action:         'update',
      changedFields,
      previousValues: _vulnSnapshot(previous),
      newValues:      _vulnSnapshot(record),
      organizationId: effectiveOrgId,
    });
  }

  return mapRecord(record);
}

/**
 * Delete a vulnerability and write a deletion audit log entry.
 * Note: the audit log record's `cascadeDelete` on the vulnerability relation
 * means the audit entry will also be deleted if the vuln is hard-deleted.
 * This is intentional — the audit log exists for operational review, not
 * long-term forensics.
 * @param {string} id
 * @param {string} organizationId
 */
export async function deleteVulnerability(id, organizationId) {
  const previous = await pb.collection('vulnerabilities').getOne(id);
  const effectiveOrgId = organizationId || currentOrgId || sessionStorage.getItem('pb_org_id');
  await _writeVulnAudit({
    vulnerability:  id,
    action:         'delete',
    changedFields:  [],
    previousValues: _vulnSnapshot(previous),
    newValues:      null,
    organizationId: effectiveOrgId,
  });

  // requestKey: null prevents auto-cancellation when called in parallel (Clear All)
  await pb.collection('vulnerabilities').delete(id, { requestKey: null });
}

// ─── Groups ───────────────────────────────────────────────────────────────────

/** Fetch all groups for the given organization. */
export async function fetchGroups(organizationId) {
  return pb.collection('groups').getFullList({
    filter:     `organization = "${organizationId}"`,
    sort:       'name',
    requestKey: null, // prevent StrictMode double-invocation from auto-cancelling
  });
}

/** Fetch all users for the given organization, sorted by email. */
export async function fetchUsers(organizationId) {
  const effectiveOrgId = organizationId || currentOrgId || sessionStorage.getItem('pb_org_id');
  return pb.collection('users').getFullList({
    filter:     `organization = "${effectiveOrgId}"`,
    sort:       'email',
    requestKey: null, // prevent StrictMode double-invocation from auto-cancelling
  });
}

/**
 * Create a new user account and write a user_invited audit log entry.
 * Requires the calling user to have role = 'admin' (enforced by PocketBase rules).
 * Sets verified = true because the admin is providing the password directly.
 */
export async function inviteUser(email, password, fullName, role, organizationId) {
  const effectiveOrgId = organizationId || currentOrgId || sessionStorage.getItem('pb_org_id');
  const record = await pb.collection('users').create({
    email,
    emailVisibility: true,
    password,
    passwordConfirm: password,
    name:            fullName || '',
    role,
    organization:    effectiveOrgId,
  });
  await _writeAccessAudit({
    action:         'user_invited',
    resourceType:   'user',
    resourceId:     record.id,
    details:        { email, role, name: fullName || '' },
    organizationId: effectiveOrgId,
  });
  return record;
}

/**
 * Update a user's role and write a role_changed audit log entry.
 * Fetches the previous role from PocketBase to include in the audit entry.
 */
export async function updateUserRole(userId, newRole, organizationId) {
  const effectiveOrgId = organizationId || currentOrgId || sessionStorage.getItem('pb_org_id');
  const previous = await pb.collection('users').getOne(userId);
  const record   = await pb.collection('users').update(userId, { role: newRole });
  await _writeAccessAudit({
    action:         'role_changed',
    resourceType:   'user',
    resourceId:     userId,
    details:        { previous_values: { role: previous.role }, new_values: { role: newRole } },
    organizationId: effectiveOrgId,
  });
  return record;
}

/**
 * Delete a user record and write a user_deleted audit log entry.
 * Audit is written BEFORE deletion (mirrors deleteVulnerability pattern).
 * PocketBase rules prevent admins from deleting their own account.
 */
export async function removeUser(userId, organizationId) {
  const effectiveOrgId = organizationId || currentOrgId || sessionStorage.getItem('pb_org_id');
  await _writeAccessAudit({
    action:         'user_deleted',
    resourceType:   'user',
    resourceId:     userId,
    details:        {},
    organizationId: effectiveOrgId,
  });
  await pb.collection('users').delete(userId);
}

// ─── Org settings ─────────────────────────────────────────────────────────────

/**
 * Fetch the org_settings record for the given organization.
 * Returns null if no record exists yet (first-time use).
 * Maps threshold and defaultWeights fields with hardcoded fallbacks so callers
 * always receive normalised values regardless of DB state.
 */
export async function fetchOrgSettings(organizationId) {
  const items = await pb.collection('org_settings').getFullList({
    filter:     `organization = "${organizationId}"`,
    requestKey: null,
  });
  const record = items[0] ?? null;
  if (!record) return null;
  return {
    ...record,
    criticalThreshold: record.criticalThreshold ?? 80,
    highThreshold:     record.highThreshold     ?? 60,
    mediumThreshold:   record.mediumThreshold   ?? 40,
    defaultWeights: {
      cvss:           record.defaultWeightCvss           ?? 20,
      criticality:    record.defaultWeightCriticality    ?? 25,
      assetCount:     record.defaultWeightAssetCount     ?? 15,
      exposure:       record.defaultWeightExposure       ?? 15,
      exploitability: record.defaultWeightExploitability ?? 10,
      epss:           record.defaultWeightEpss           ?? 10,
      days:           record.defaultWeightDays           ?? 5,
    },
  };
}

/**
 * Upsert the org_settings record for an organization.
 * Creates the record if it doesn't exist, updates it if it does.
 * @param {string} organizationId
 * @param {object} settings  - { nvd_api_key?, lastKevSync?,
 *                               criticalThreshold?, highThreshold?, mediumThreshold?,
 *                               defaultWeightCvss?, … defaultWeightDays? }
 */
export async function updateOrgSettings(organizationId, settings) {
  const existing = await fetchOrgSettings(organizationId);
  // Preserve all existing fields — only override what is explicitly provided.
  const data = {
    organization:       organizationId,
    nvd_api_key:        settings.nvd_api_key        ?? existing?.nvd_api_key        ?? '',
    defaultFeedsSeeded: settings.defaultFeedsSeeded ?? existing?.defaultFeedsSeeded ?? false,
  };
  if (settings.lastKevSync               !== undefined) data.lastKevSync               = settings.lastKevSync;
  if (settings.criticalThreshold         !== undefined) data.criticalThreshold         = settings.criticalThreshold;
  if (settings.highThreshold             !== undefined) data.highThreshold             = settings.highThreshold;
  if (settings.mediumThreshold           !== undefined) data.mediumThreshold           = settings.mediumThreshold;
  if (settings.defaultWeightCvss         !== undefined) data.defaultWeightCvss         = settings.defaultWeightCvss;
  if (settings.defaultWeightCriticality  !== undefined) data.defaultWeightCriticality  = settings.defaultWeightCriticality;
  if (settings.defaultWeightAssetCount   !== undefined) data.defaultWeightAssetCount   = settings.defaultWeightAssetCount;
  if (settings.defaultWeightExposure     !== undefined) data.defaultWeightExposure     = settings.defaultWeightExposure;
  if (settings.defaultWeightExploitability !== undefined) data.defaultWeightExploitability = settings.defaultWeightExploitability;
  if (settings.defaultWeightEpss         !== undefined) data.defaultWeightEpss         = settings.defaultWeightEpss;
  if (settings.defaultWeightDays         !== undefined) data.defaultWeightDays         = settings.defaultWeightDays;
  if (existing) return pb.collection('org_settings').update(existing.id, data);
  return pb.collection('org_settings').create(data);
}

// ─── Scoring config validation ────────────────────────────────────────────────

/**
 * Validate risk tier thresholds.
 * Constraints: critical > high > medium, medium ≥ 1, critical ≤ 99.
 *
 * @param {number} critical
 * @param {number} high
 * @param {number} medium
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateThresholds(critical, high, medium) {
  if (critical > 99)      return { valid: false, error: 'Critical threshold cannot exceed 99' };
  if (medium < 1)         return { valid: false, error: 'Medium threshold must be at least 1' };
  if (critical <= high)   return { valid: false, error: 'Critical threshold must be higher than High' };
  if (high <= medium)     return { valid: false, error: 'High threshold must be higher than Medium' };
  return { valid: true, error: null };
}

/**
 * Validate org-level default scoring weights.
 * All weights must be non-negative and sum to exactly 100.
 *
 * @param {object} weights - { cvss, criticality, assetCount, exposure, exploitability, epss, days }
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateDefaultWeights(weights) {
  if (Object.values(weights).some((v) => v < 0)) {
    return { valid: false, error: 'Weights cannot be negative' };
  }
  const total = Object.values(weights).reduce((sum, v) => sum + v, 0);
  if (total !== 100) {
    return { valid: false, error: `Weights must sum to 100 (currently ${total})` };
  }
  return { valid: true, error: null };
}

/**
 * Batch-update the riskTier field for vulnerabilities whose tier changed after a
 * threshold configuration change. Writes a system-generated audit log entry for
 * each updated record.
 *
 * @param {{ id: string, oldTier: string, newTier: string }[]} changes
 * @param {string} organizationId
 */
export async function updateRiskTierBatch(changes, organizationId) {
  const effectiveOrgId = organizationId || currentOrgId || sessionStorage.getItem('pb_org_id');
  await Promise.all(changes.map(async ({ id, oldTier, newTier }) => {
    try {
      await pb.collection('vulnerabilities').update(id, { riskTier: newTier }, { requestKey: null });
      await _writeVulnAudit({
        vulnerability:   id,
        action:          'update',
        changedFields:   ['riskTier'],
        previousValues:  { riskTier: oldTier },
        newValues:       { riskTier: newTier },
        organizationId:  effectiveOrgId,
        systemGenerated: true,
      });
    } catch (err) {
      console.error('[updateRiskTierBatch] failed to update tier for:', id, err);
    }
  }));
}

// ─── Status workflow ──────────────────────────────────────────────────────────

/**
 * Change the status of a vulnerability and write a status_changed audit log entry.
 * When the new status is a closed status (Remediated, Accepted Risk, False Positive),
 * also updates assigned_to to the current user.
 *
 * @param {string}      vulnerabilityId
 * @param {string}      newStatus       - One of VULNERABILITY_STATUSES
 * @param {string|null} comment         - Optional justification comment
 * @param {string}      currentUserId   - ID of the authenticated user making the change
 * @param {string}      organizationId
 */
export async function changeVulnerabilityStatus(vulnerabilityId, newStatus, comment, currentUserId, organizationId, { bulkAction = false } = {}) {
  const effectiveOrgId = organizationId || currentOrgId || sessionStorage.getItem('pb_org_id');

  const current = await pb.collection('vulnerabilities').getOne(vulnerabilityId, { requestKey: null });

  const isClosed = CLOSED_STATUSES.includes(newStatus);
  const updates = {
    status:        newStatus,
    latestComment: comment ?? null,
  };
  if (isClosed) {
    updates.assigned_to = currentUserId;
  }

  await pb.collection('vulnerabilities').update(vulnerabilityId, updates, { requestKey: null });

  const newValues = {
    status:      newStatus,
    comment:     comment ?? null,
    assigned_to: isClosed ? currentUserId : (current.assigned_to ?? null),
  };
  if (bulkAction) newValues.bulk_action = true;

  await _writeVulnAudit({
    vulnerability:  vulnerabilityId,
    action:         'status_changed',
    changedFields:  isClosed ? ['status', 'assigned_to'] : ['status'],
    previousValues: {
      status:      current.status      ?? 'Open',
      assigned_to: current.assigned_to ?? null,
    },
    newValues,
    organizationId:  effectiveOrgId,
    systemGenerated: false,
  });
}

// ─── Bulk operations ──────────────────────────────────────────────────────────

/**
 * Bulk-assign a group to a set of vulnerability records.
 * @param {string[]} ids           - Array of vulnerability IDs
 * @param {string|null} groupId    - Group ID to assign, or null/'' to unassign
 * @param {string} organizationId
 * @returns {{ succeeded: number, failed: number, total: number }}
 */
export async function bulkAssignGroup(ids, groupId, organizationId) {
  const effectiveOrgId = organizationId || currentOrgId || sessionStorage.getItem('pb_org_id');
  const results = await Promise.allSettled(ids.map(async (id) => {
    const previous = await pb.collection('vulnerabilities').getOne(id, { requestKey: null });
    await pb.collection('vulnerabilities').update(id, { group: groupId || null }, { requestKey: null });
    await _writeVulnAudit({
      vulnerability:  id,
      action:         'update',
      changedFields:  ['group'],
      previousValues: { group: previous.group ?? null },
      newValues:      { group: groupId || null, bulk_action: true },
      organizationId: effectiveOrgId,
    });
    return id;
  }));
  return _bulkPartialResults(results);
}

/**
 * Bulk-assign a user to a set of vulnerability records.
 * @param {string[]} ids           - Array of vulnerability IDs
 * @param {string|null} userId     - User ID to assign, or null/'' to unassign
 * @param {string} organizationId
 * @returns {{ succeeded: number, failed: number, total: number }}
 */
export async function bulkAssignUser(ids, userId, organizationId) {
  const effectiveOrgId = organizationId || currentOrgId || sessionStorage.getItem('pb_org_id');
  const results = await Promise.allSettled(ids.map(async (id) => {
    const previous = await pb.collection('vulnerabilities').getOne(id, { requestKey: null });
    await pb.collection('vulnerabilities').update(id, { assigned_to: userId || null }, { requestKey: null });
    await _writeVulnAudit({
      vulnerability:  id,
      action:         'update',
      changedFields:  ['assigned_to'],
      previousValues: { assigned_to: previous.assigned_to ?? null },
      newValues:      { assigned_to: userId || null, bulk_action: true },
      organizationId: effectiveOrgId,
    });
    return id;
  }));
  return _bulkPartialResults(results);
}

/**
 * Bulk-delete a set of vulnerability records (audit written per record).
 * @param {string[]} ids
 * @param {string} organizationId
 * @returns {{ succeeded: number, failed: number, total: number }}
 */
export async function bulkDeleteVulnerabilities(ids, organizationId) {
  const results = await Promise.allSettled(
    ids.map((id) => deleteVulnerability(id, organizationId))
  );
  return _bulkPartialResults(results);
}

function _bulkPartialResults(results) {
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed    = results.filter((r) => r.status === 'rejected').length;
  return { succeeded, failed, total: results.length };
}

// ─── NVD lookup ───────────────────────────────────────────────────────────────

/**
 * Look up a CVE in the NIST NVD API.
 *
 * In development (npm run dev) requests are forwarded by Vite's dev-server proxy
 * at /nvd-api → https://services.nvd.nist.gov, which avoids CORS restrictions.
 * The proxy config lives in vite.config.js.
 *
 * Returns one of:
 *   { error: 'not_found' | 'rate_limited' | 'network_error' | 'malformed' }
 *   { description, cvssV3Score, cvssV3Vector, cvssV2Score, hasV3, hasV2Only }
 *
 * @param {string}      cveId   - e.g. "CVE-2021-44228"
 * @param {string|null} apiKey  - NVD API key; raises rate limit from 5/30s to 50/30s
 */
export async function lookupNvd(cveId, apiKey = null) {
  const url = `/nvd-api/rest/json/cves/2.0?cveId=${encodeURIComponent(cveId.toUpperCase())}`;
  const headers = {};
  if (apiKey) headers['apiKey'] = apiKey;

  let response;
  try {
    response = await fetch(url, { headers });
  } catch (_) {
    return { error: 'network_error' };
  }

  if (response.status === 404) return { error: 'not_found' };
  if (response.status === 403 || response.status === 429) return { error: 'rate_limited' };
  if (!response.ok) return { error: 'network_error' };

  let data;
  try {
    data = await response.json();
  } catch (_) {
    return { error: 'malformed' };
  }

  if (!data.vulnerabilities?.length) return { error: 'not_found' };

  const cve         = data.vulnerabilities[0].cve;
  const description = cve.descriptions?.find((d) => d.lang === 'en')?.value ?? null;
  const cvssV3      = cve.metrics?.cvssMetricV31?.[0]?.cvssData
                   ?? cve.metrics?.cvssMetricV30?.[0]?.cvssData
                   ?? null;
  const cvssV2      = cve.metrics?.cvssMetricV2?.[0]?.cvssData ?? null;

  return {
    description,
    cvssV3Score:  cvssV3?.baseScore  ?? null,
    cvssV3Vector: cvssV3?.vectorString ?? null,
    cvssV2Score:  cvssV2?.baseScore  ?? null,
    hasV3:        cvssV3 !== null,
    hasV2Only:    cvssV3 === null && cvssV2 !== null,
  };
}

// ─── EPSS API lookup ──────────────────────────────────────────────────────────

/**
 * Look up EPSS score and percentile for a CVE from the FIRST.org EPSS API.
 * The API is public with no authentication required and supports CORS.
 *
 * @param {string} cveId - CVE identifier, e.g. 'CVE-2021-44228'
 * @returns {{ epssScore: number, epssPercentile: number } | { error: string }}
 */
export async function lookupEpss(cveId) {
  const url = `https://api.first.org/data/v1/epss?cve=${encodeURIComponent(cveId)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return { error: 'network_error' };

    const data = await response.json();
    if (!data.data || data.data.length === 0) return { error: 'not_found' };

    const entry = data.data[0];
    return {
      epssScore:      parseFloat(entry.epss),
      epssPercentile: parseFloat(entry.percentile),
    };
  } catch {
    return { error: 'network_error' };
  }
}

// ─── CISA KEV feed ────────────────────────────────────────────────────────────

/**
 * Fetch the CISA Known Exploited Vulnerabilities catalog.
 * The feed is a public JSON endpoint; no authentication required.
 *
 * @returns {{ vulnerabilities: object[] } | { error: string }}
 */
export async function fetchKevCatalog() {
  try {
    const response = await fetch(
      '/kev-api/sites/default/files/feeds/known_exploited_vulnerabilities.json'
    );
    if (!response.ok) return { error: 'network_error' };
    let data;
    try {
      data = await response.json();
    } catch {
      return { error: 'malformed' };
    }
    if (!Array.isArray(data?.vulnerabilities)) return { error: 'malformed' };
    return { vulnerabilities: data.vulnerabilities };
  } catch {
    return { error: 'network_error' };
  }
}

/**
 * Compare the CISA KEV catalog against tracked vulnerabilities and flag matches.
 *
 * For each tracked vulnerability whose CVE ID appears in the catalog but has not
 * yet been flagged (isKev !== true), this function:
 *   1. Updates the PocketBase record: isKev=true, kevDateAdded, exploitability='Actively Exploited'
 *   2. Writes a system_generated audit log entry
 *
 * Then updates lastKevSync in org_settings.
 *
 * @param {object[]} trackedVulnerabilities - The current vulnerabilities array (from app state)
 * @param {string}   organizationId
 * @returns {{ newMatches: string[], totalMatched: number, lastSync: string|null, error: string|null }}
 */
export async function syncKevFeed(trackedVulnerabilities, organizationId) {
  const effectiveOrgId = organizationId || currentOrgId || sessionStorage.getItem('pb_org_id');

  const catalogResult = await fetchKevCatalog();
  if (catalogResult.error) {
    return { newMatches: [], totalMatched: 0, lastSync: null, error: catalogResult.error };
  }

  // Build Map: uppercase cveID → catalog entry (for O(1) lookup)
  const kevMap = new Map(
    catalogResult.vulnerabilities.map((entry) => [entry.cveID.toUpperCase(), entry])
  );

  const newMatches = [];

  for (const vuln of trackedVulnerabilities) {
    const kevEntry = kevMap.get(vuln.cveId.toUpperCase());
    if (!kevEntry) continue;       // not in KEV catalog
    if (vuln.isKev) continue;      // already flagged — no double-update

    const previous = {
      isKev:          vuln.isKev         ?? false,
      kevDateAdded:   vuln.kevDateAdded  ?? null,
      exploitability: vuln.exploitability,
    };

    try {
      await pb.collection('vulnerabilities').update(vuln.id, {
        isKev:          true,
        kevDateAdded:   kevEntry.dateAdded,
        exploitability: 'Actively Exploited',
      }, { requestKey: null });

      await _writeVulnAudit({
        vulnerability:   vuln.id,
        action:          'update',
        changedFields:   ['isKev', 'kevDateAdded', 'exploitability'],
        previousValues:  previous,
        newValues:       { isKev: true, kevDateAdded: kevEntry.dateAdded, exploitability: 'Actively Exploited' },
        organizationId:  effectiveOrgId,
        systemGenerated: true,
      });

      newMatches.push(vuln.cveId);
    } catch (err) {
      console.error('[syncKevFeed] failed to update vuln:', vuln.cveId, err);
    }
  }

  const totalMatched = trackedVulnerabilities.filter(
    (v) => kevMap.has(v.cveId.toUpperCase())
  ).length;

  const lastSync = new Date().toISOString();
  try {
    await updateOrgSettings(effectiveOrgId, { lastKevSync: lastSync });
  } catch (err) {
    console.error('[syncKevFeed] failed to update lastKevSync:', err);
  }

  return { newMatches, totalMatched, lastSync, error: null };
}

// ─── Scoring weights ──────────────────────────────────────────────────────────

/**
 * Fetch the scoring weights record for the given organization.
 * Returns null if no record exists yet (first-time use).
 */
export async function fetchScoringWeights(organizationId) {
  const items = await pb.collection('scoring_weights').getFullList({
    filter: `organization = "${organizationId}"`,
    requestKey: null, // prevent StrictMode double-invocation from auto-cancelling
  });
  return items[0] ?? null;
}

/**
 * Upsert the scoring weights for an organization.
 * Creates the record if it doesn't exist, updates it if it does.
 * @param {string} organizationId
 * @param {object} weights  - { cvss, criticality, assetCount, exposure, exploitability, epss, days }
 * @returns {Promise<object>} the saved PocketBase record
 */
export async function updateScoringWeights(organizationId, weights) {
  const existing = await fetchScoringWeights(organizationId);

  const data = {
    organization:  organizationId,
    cvss:          weights.cvss,
    criticality:   weights.criticality,
    assetCount:    weights.assetCount,
    exposure:      weights.exposure,
    exploitability: weights.exploitability,
    epss:          weights.epss,
    days:          weights.days,
  };

  let record;
  if (existing) {
    record = await pb.collection('scoring_weights').update(existing.id, data);
  } else {
    record = await pb.collection('scoring_weights').create(data);
  }

  await _writeAccessAudit({
    action:        'weights_updated',
    resourceType:  'scoring_weights',
    resourceId:    record.id,
    details:       { weights },
    organizationId,
  });

  return record;
}

// ─── Audit logs ───────────────────────────────────────────────────────────────

/** Fetch vulnerability audit log entries for an organization. */
export async function fetchVulnerabilityAuditLog(organizationId) {
  return pb.collection('vulnerability_audit_log').getFullList({
    filter: `organization = "${organizationId}"`,
    sort:   '-created',
    expand: 'user,vulnerability',
  });
}

/** Fetch access audit log entries for an organization. */
export async function fetchAccessAuditLog(organizationId) {
  return pb.collection('access_audit_log').getFullList({
    filter: `organization = "${organizationId}"`,
    sort:   '-created',
    expand: 'user',
  });
}

// ─── Record mapping ───────────────────────────────────────────────────────────

/**
 * Normalise a raw PocketBase vulnerability record to the shape the frontend
 * expects. Every numeric and enum field gets a safe fallback so that
 * downstream components never receive undefined.
 */
function mapRecord(record) {
  return {
    id:                 record.id,
    cveId:              record.cveId              ?? '',
    title:              record.title              ?? '',
    cvssScore:          record.cvssScore          ?? 0,
    assetCriticality:   record.assetCriticality   ?? 'Medium',
    internetFacing:     record.internetFacing      ?? false,
    exploitability:     record.exploitability      ?? 'Theoretical',
    daysSinceDiscovery: record.daysSinceDiscovery  ?? 0,
    affectedAssetCount: record.affectedAssetCount  ?? 1,
    compositeScore:     record.compositeScore      ?? 0,
    riskTier:           record.riskTier            ?? 'Low',
    epssScore:          record.epssScore           ?? null,
    epssPercentile:     record.epssPercentile      ?? null,
    isKev:              record.isKev               ?? false,
    kevDateAdded:       record.kevDateAdded        ?? null,
    status:             record.status              ?? 'Open',
    latestComment:      record.latestComment       ?? null,
    group:              record.group               ?? '',
    groupName:          record.expand?.group?.name        ?? '',
    assignedTo:         record.assigned_to                ?? '',
    assignedToEmail:    record.expand?.assigned_to?.email ?? '',
    organization:       record.organization        ?? '',
    dateAdded:          record.dateAdded,
    created:            record.created,
    updated:            record.updated,
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _vulnSnapshot(record) {
  return {
    cveId:              record.cveId,
    title:              record.title,
    cvssScore:          record.cvssScore,
    assetCriticality:   record.assetCriticality,
    internetFacing:     record.internetFacing,
    exploitability:     record.exploitability,
    daysSinceDiscovery: record.daysSinceDiscovery,
    affectedAssetCount: record.affectedAssetCount,
    compositeScore:     record.compositeScore,
    riskTier:           record.riskTier,
    isKev:              record.isKev        ?? false,
    kevDateAdded:       record.kevDateAdded ?? null,
    group:              record.group        ?? null,
    assigned_to:        record.assigned_to  ?? null,
  };
}

async function _writeVulnAudit({ vulnerability, action, changedFields, previousValues, newValues, organizationId, systemGenerated = false }) {
  const user = getCurrentUser();
  if (!user) {
    console.warn('[_writeVulnAudit] no authenticated user — skipping audit write');
    return;
  }
  // Use the same fallback chain as the mutation functions so audit entries are
  // never silently dropped just because the caller passed a stale null param.
  const effectiveOrgId = organizationId || currentOrgId || sessionStorage.getItem('pb_org_id');
  if (!vulnerability || !effectiveOrgId) {
    console.warn('[_writeVulnAudit] missing required field —', { vulnerability, effectiveOrgId });
    return;
  }
  try {
    await pb.collection('vulnerability_audit_log').create({
      vulnerability,
      user:             user.id,
      organization:     effectiveOrgId,
      action,
      changed_fields:   changedFields,
      previous_values:  previousValues,
      new_values:       newValues,
      system_generated: systemGenerated,
    }, { requestKey: null });
  } catch (err) {
    console.error('[_writeVulnAudit] audit write failed — vulnerability:', vulnerability, 'action:', action, err);
  }
}

async function _writeAccessAudit({ action, resourceType, resourceId, details, organizationId }) {
  const user = getCurrentUser();
  if (!user) {
    console.warn('[_writeAccessAudit] no authenticated user — skipping audit write');
    return;
  }
  try {
    await pb.collection('access_audit_log').create({
      user:          user.id,
      organization:  organizationId,
      action,
      resource_type: resourceType,
      resource_id:   resourceId,
      details,
    }, { requestKey: null });
  } catch (err) {
    console.error('[_writeAccessAudit] audit write failed — action:', action, err);
  }
}

// ─── RSS feeds ────────────────────────────────────────────────────────────────

/**
 * Fetch all rss_feeds records for the given organization, sorted by
 * displayOrder then name.
 */
export async function fetchRssFeeds(organizationId) {
  return pb.collection('rss_feeds').getFullList({
    filter:     `organization = "${organizationId}"`,
    sort:       'displayOrder,name',
    requestKey: null,
  });
}

/**
 * Create a new RSS feed record for the organization.
 * New feeds are enabled by default.
 */
export async function createRssFeed(organizationId, name, url) {
  return pb.collection('rss_feeds').create({
    organization: organizationId,
    name,
    url,
    enabled:      true,
    displayOrder: 0,
  }, { requestKey: null });
}

/**
 * Update an existing RSS feed record (e.g. enabled toggle, lastFetched).
 */
export async function updateRssFeed(feedId, updates) {
  return pb.collection('rss_feeds').update(feedId, updates, { requestKey: null });
}

/**
 * Delete an RSS feed record.
 */
export async function deleteRssFeed(feedId) {
  return pb.collection('rss_feeds').delete(feedId, { requestKey: null });
}

/**
 * Fetch raw XML from an RSS/Atom feed URL via the PocketBase server-side proxy.
 * The proxy bypasses browser CORS restrictions.
 *
 * @param {string} feedUrl - The RSS/Atom feed URL to fetch
 * @returns {{ xml: string } | { error: string }}
 */
export async function fetchRssFeedContent(feedUrl) {
  const proxiedUrl = `${pb.baseURL}/api/rss-proxy?url=${encodeURIComponent(feedUrl)}`;
  try {
    const response = await fetch(proxiedUrl);
    if (!response.ok) return { error: 'proxy_error' };
    const xml = await response.text();
    return { xml };
  } catch {
    return { error: 'network_error' };
  }
}
