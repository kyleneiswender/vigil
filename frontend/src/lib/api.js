/**
 * api.js — all PocketBase data operations for the vulnerability prioritization tool.
 *
 * Every function that mutates data also writes an audit log entry. The caller
 * is responsible for passing the correct organizationId (taken from the
 * authenticated user's `organization` field).
 */

import { pb, getCurrentUser } from './pocketbase.js';

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
    filter: `organization = "${organizationId}"`,
    sort:   'name',
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
 */
export async function fetchOrgSettings(organizationId) {
  const items = await pb.collection('org_settings').getFullList({
    filter:     `organization = "${organizationId}"`,
    requestKey: null,
  });
  return items[0] ?? null;
}

/**
 * Upsert the org_settings record for an organization.
 * Creates the record if it doesn't exist, updates it if it does.
 * @param {string} organizationId
 * @param {object} settings  - { nvd_api_key }
 */
export async function updateOrgSettings(organizationId, settings) {
  const existing = await fetchOrgSettings(organizationId);
  const data = {
    organization: organizationId,
    nvd_api_key:  settings.nvd_api_key ?? '',
  };
  if (existing) return pb.collection('org_settings').update(existing.id, data);
  return pb.collection('org_settings').create(data);
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
 * @param {object} weights  - { cvss, criticality, assetCount, exposure, exploitability, days }
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
    status:             record.status              ?? 'open',
    group:              record.group               ?? '',
    groupName:          record.expand?.group?.name        ?? '',
    assignedTo:         record.assigned_to                ?? '',
    assignedToEmail:    record.expand?.assigned_to?.email ?? '',
    organization:       record.organization        ?? '',
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
    group:              record.group        ?? null,
    assigned_to:        record.assigned_to  ?? null,
  };
}

async function _writeVulnAudit({ vulnerability, action, changedFields, previousValues, newValues, organizationId }) {
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
      user:            user.id,
      organization:    effectiveOrgId,
      action,
      changed_fields:  changedFields,
      previous_values: previousValues,
      new_values:      newValues,
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
