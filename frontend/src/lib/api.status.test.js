/**
 * api.status.test.js
 *
 * Unit tests for:
 *   changeVulnerabilityStatus  — status workflow with audit logging
 *   createVulnerability        — always creates with status='Open'
 *
 * Mock pattern matches api.nvd.test.js:
 *   vi.hoisted() + vi.mock('./pocketbase.js') + sessionStorage polyfill.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── sessionStorage polyfill (Vitest env is 'node') ──────────────────────────
const _ss = {};
global.sessionStorage = {
  getItem:    (k)    => Object.prototype.hasOwnProperty.call(_ss, k) ? _ss[k] : null,
  setItem:    (k, v) => { _ss[k] = String(v); },
  removeItem: (k)    => { delete _ss[k]; },
  clear:      ()     => { for (const k in _ss) delete _ss[k]; },
};

// ─── Hoisted mock handles ─────────────────────────────────────────────────────
const m = vi.hoisted(() => ({
  authStoreRecord:  null,
  vulnsGetOne:      vi.fn(),
  vulnsUpdate:      vi.fn(),
  vulnsCreate:      vi.fn(),
  auditCreate:      vi.fn(),
  orgSettingsGetFullList: vi.fn(),
  orgSettingsCreate:      vi.fn(),
  orgSettingsUpdate:      vi.fn(),
}));

vi.mock('./pocketbase.js', () => ({
  pb: {
    authStore: {
      get model() { return m.authStoreRecord; },
      isValid: true,
      onChange: vi.fn(() => () => {}),
      save: vi.fn(),
    },
    collection: vi.fn((name) => {
      if (name === 'vulnerabilities') {
        return {
          getOne:   m.vulnsGetOne,
          update:   m.vulnsUpdate,
          create:   m.vulnsCreate,
        };
      }
      if (name === 'vulnerability_audit_log') return { create: m.auditCreate };
      if (name === 'org_settings') {
        return {
          getFullList: m.orgSettingsGetFullList,
          create:      m.orgSettingsCreate,
          update:      m.orgSettingsUpdate,
        };
      }
      return {};
    }),
    baseURL: 'http://localhost:8090',
  },
  getCurrentUser:  () => m.authStoreRecord,
  isAuthenticated: () => !!m.authStoreRecord,
  logout: vi.fn(),
}));

import { changeVulnerabilityStatus, createVulnerability } from './api.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID    = 'org_abc123';
const USER_ID   = 'usr_analyst';
const VULN_ID   = 'vuln_001';
const AUTH_USER = { id: USER_ID, email: 'analyst@corp.com', organization: ORG_ID, role: 'analyst' };

beforeEach(() => {
  vi.clearAllMocks();
  m.authStoreRecord = AUTH_USER;
  m.auditCreate.mockResolvedValue({});
});

// ─── changeVulnerabilityStatus ────────────────────────────────────────────────

describe('changeVulnerabilityStatus — non-closed statuses', () => {
  it('updates status and latestComment without changing assigned_to', async () => {
    const current = { id: VULN_ID, status: 'Open', assigned_to: 'usr_other' };
    m.vulnsGetOne.mockResolvedValue(current);
    m.vulnsUpdate.mockResolvedValue({ ...current, status: 'In Progress', latestComment: 'Working on it' });

    await changeVulnerabilityStatus(VULN_ID, 'In Progress', 'Working on it', USER_ID, ORG_ID);

    const updateCall = m.vulnsUpdate.mock.calls[0][1];
    expect(updateCall.status).toBe('In Progress');
    expect(updateCall.latestComment).toBe('Working on it');
    expect(updateCall.assigned_to).toBeUndefined(); // not set for non-closed status
  });

  it('writes status_changed audit with only status in changedFields', async () => {
    const current = { id: VULN_ID, status: 'Open', assigned_to: null };
    m.vulnsGetOne.mockResolvedValue(current);
    m.vulnsUpdate.mockResolvedValue({ ...current, status: 'In Progress' });

    await changeVulnerabilityStatus(VULN_ID, 'In Progress', null, USER_ID, ORG_ID);

    const audit = m.auditCreate.mock.calls[0][0];
    expect(audit.action).toBe('status_changed');
    expect(audit.changed_fields).toEqual(['status']);
    expect(audit.previous_values.status).toBe('Open');
    expect(audit.new_values.status).toBe('In Progress');
    expect(audit.new_values.comment).toBeNull();
    expect(audit.system_generated).toBe(false);
  });

  it('Risk Re-opened does not auto-assign', async () => {
    const current = { id: VULN_ID, status: 'Remediated', assigned_to: 'usr_other' };
    m.vulnsGetOne.mockResolvedValue(current);
    m.vulnsUpdate.mockResolvedValue({ ...current, status: 'Risk Re-opened' });

    await changeVulnerabilityStatus(VULN_ID, 'Risk Re-opened', null, USER_ID, ORG_ID);

    const updateCall = m.vulnsUpdate.mock.calls[0][1];
    expect(updateCall.assigned_to).toBeUndefined();
  });
});

describe('changeVulnerabilityStatus — closed statuses auto-assign', () => {
  it('Remediated auto-assigns to current user', async () => {
    const current = { id: VULN_ID, status: 'Open', assigned_to: null };
    m.vulnsGetOne.mockResolvedValue(current);
    m.vulnsUpdate.mockResolvedValue({ ...current, status: 'Remediated', assigned_to: USER_ID });

    await changeVulnerabilityStatus(VULN_ID, 'Remediated', 'Fixed in v2.1', USER_ID, ORG_ID);

    const updateCall = m.vulnsUpdate.mock.calls[0][1];
    expect(updateCall.status).toBe('Remediated');
    expect(updateCall.assigned_to).toBe(USER_ID);
  });

  it('Accepted Risk auto-assigns to current user', async () => {
    const current = { id: VULN_ID, status: 'Open', assigned_to: null };
    m.vulnsGetOne.mockResolvedValue(current);
    m.vulnsUpdate.mockResolvedValue({ ...current, status: 'Accepted Risk', assigned_to: USER_ID });

    await changeVulnerabilityStatus(VULN_ID, 'Accepted Risk', 'Low priority asset', USER_ID, ORG_ID);

    const updateCall = m.vulnsUpdate.mock.calls[0][1];
    expect(updateCall.assigned_to).toBe(USER_ID);
  });

  it('False Positive auto-assigns to current user', async () => {
    const current = { id: VULN_ID, status: 'Open', assigned_to: null };
    m.vulnsGetOne.mockResolvedValue(current);
    m.vulnsUpdate.mockResolvedValue({ ...current, status: 'False Positive', assigned_to: USER_ID });

    await changeVulnerabilityStatus(VULN_ID, 'False Positive', 'Confirmed FP', USER_ID, ORG_ID);

    const updateCall = m.vulnsUpdate.mock.calls[0][1];
    expect(updateCall.assigned_to).toBe(USER_ID);
  });

  it('closed status includes assigned_to in changedFields', async () => {
    const current = { id: VULN_ID, status: 'In Progress', assigned_to: null };
    m.vulnsGetOne.mockResolvedValue(current);
    m.vulnsUpdate.mockResolvedValue({ ...current, status: 'Remediated', assigned_to: USER_ID });

    await changeVulnerabilityStatus(VULN_ID, 'Remediated', 'Done', USER_ID, ORG_ID);

    const audit = m.auditCreate.mock.calls[0][0];
    expect(audit.changed_fields).toContain('status');
    expect(audit.changed_fields).toContain('assigned_to');
    expect(audit.new_values.assigned_to).toBe(USER_ID);
  });

  it('closed status audit includes comment in new_values', async () => {
    const current = { id: VULN_ID, status: 'Open', assigned_to: null };
    m.vulnsGetOne.mockResolvedValue(current);
    m.vulnsUpdate.mockResolvedValue({ ...current, status: 'Accepted Risk', assigned_to: USER_ID });

    await changeVulnerabilityStatus(VULN_ID, 'Accepted Risk', 'Business decision', USER_ID, ORG_ID);

    const audit = m.auditCreate.mock.calls[0][0];
    expect(audit.new_values.comment).toBe('Business decision');
  });
});

// ─── createVulnerability always sets status='Open' ───────────────────────────

describe('createVulnerability — status field', () => {
  it('always creates records with status = "Open" regardless of input', async () => {
    m.vulnsCreate.mockResolvedValue({
      id: 'vuln_new', cveId: 'CVE-2024-9999', title: 'Test', status: 'Open',
      cvssScore: 7.5, assetCriticality: 'High', internetFacing: false,
      exploitability: 'Theoretical', daysSinceDiscovery: 10, affectedAssetCount: 5,
      compositeScore: 50, riskTier: 'Medium', epssScore: null, epssPercentile: null,
      isKev: false, kevDateAdded: null, latestComment: null,
      group: '', assigned_to: '', organization: ORG_ID,
    });

    const { createVulnerability: cv } = await import('./api.js');
    await cv(
      {
        cveId: 'CVE-2024-9999', title: 'Test', cvssScore: 7.5,
        assetCriticality: 'High', internetFacing: false,
        exploitability: 'Theoretical', daysSinceDiscovery: 10, affectedAssetCount: 5,
        compositeScore: 50, riskTier: { tier: 'Medium' },
        epssScore: null, epssPercentile: null,
        status: 'Remediated', // caller tries to set a different status — should be overridden
      },
      ORG_ID
    );

    const createPayload = m.vulnsCreate.mock.calls[0][0];
    expect(createPayload.status).toBe('Open');
  });
});
