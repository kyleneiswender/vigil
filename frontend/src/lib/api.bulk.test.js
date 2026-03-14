/**
 * api.bulk.test.js
 *
 * Unit tests for bulk operations:
 *   K1–K5  changeVulnerabilityStatus with bulkAction:true
 *   L1–L6  bulkAssignGroup
 *   M1–M6  bulkAssignUser
 *   N1–N4  bulkDeleteVulnerabilities
 *   O1–O3  _bulkPartialResults (via exported functions)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── sessionStorage polyfill ──────────────────────────────────────────────────
const _ss = {};
global.sessionStorage = {
  getItem:    (k)    => Object.prototype.hasOwnProperty.call(_ss, k) ? _ss[k] : null,
  setItem:    (k, v) => { _ss[k] = String(v); },
  removeItem: (k)    => { delete _ss[k]; },
  clear:      ()     => { for (const k in _ss) delete _ss[k]; },
};

// ─── Hoisted mock handles ─────────────────────────────────────────────────────
const m = vi.hoisted(() => ({
  authStoreRecord:        null,
  vulnsGetOne:            vi.fn(),
  vulnsUpdate:            vi.fn(),
  vulnsDelete:            vi.fn(),
  auditCreate:            vi.fn(),
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
          delete:   m.vulnsDelete,
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

import {
  changeVulnerabilityStatus,
  bulkAssignGroup,
  bulkAssignUser,
  bulkDeleteVulnerabilities,
} from './api.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID  = 'org_abc';
const USER_ID = 'usr_analyst';
const AUTH_USER = { id: USER_ID, email: 'analyst@corp.com', organization: ORG_ID, role: 'analyst' };

const makeVuln = (id, overrides = {}) => ({
  id,
  status:      'Open',
  assigned_to: null,
  group:       null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.authStoreRecord = AUTH_USER;
  m.auditCreate.mockResolvedValue({});
  m.vulnsUpdate.mockImplementation((id, data) => Promise.resolve({ id, ...data }));
  m.vulnsDelete.mockResolvedValue({});
  m.orgSettingsGetFullList.mockResolvedValue([]);
  m.orgSettingsCreate.mockResolvedValue({ id: 'os1' });
});

// ─── K: changeVulnerabilityStatus with bulkAction:true ───────────────────────

describe('changeVulnerabilityStatus — bulkAction option', () => {
  it('K1: includes bulk_action:true in new_values when bulkAction is true', async () => {
    m.vulnsGetOne.mockResolvedValue(makeVuln('v1'));
    await changeVulnerabilityStatus('v1', 'In Progress', null, USER_ID, ORG_ID, { bulkAction: true });

    const audit = m.auditCreate.mock.calls[0][0];
    expect(audit.new_values.bulk_action).toBe(true);
  });

  it('K2: does NOT include bulk_action in new_values when bulkAction is false (default)', async () => {
    m.vulnsGetOne.mockResolvedValue(makeVuln('v1'));
    await changeVulnerabilityStatus('v1', 'In Progress', null, USER_ID, ORG_ID);

    const audit = m.auditCreate.mock.calls[0][0];
    expect(audit.new_values.bulk_action).toBeUndefined();
  });

  it('K3: closed status with bulkAction:true still auto-assigns and includes bulk_action', async () => {
    m.vulnsGetOne.mockResolvedValue(makeVuln('v1'));
    await changeVulnerabilityStatus('v1', 'Remediated', 'Fixed', USER_ID, ORG_ID, { bulkAction: true });

    const updateCall = m.vulnsUpdate.mock.calls[0][1];
    expect(updateCall.assigned_to).toBe(USER_ID);

    const audit = m.auditCreate.mock.calls[0][0];
    expect(audit.new_values.bulk_action).toBe(true);
    expect(audit.new_values.assigned_to).toBe(USER_ID);
  });

  it('K4: changedFields for non-closed status only includes status', async () => {
    m.vulnsGetOne.mockResolvedValue(makeVuln('v1', { status: 'Open' }));
    await changeVulnerabilityStatus('v1', 'In Progress', null, USER_ID, ORG_ID, { bulkAction: true });

    const audit = m.auditCreate.mock.calls[0][0];
    expect(audit.changed_fields).toEqual(['status']);
  });

  it('K5: changedFields for closed status includes status and assigned_to', async () => {
    m.vulnsGetOne.mockResolvedValue(makeVuln('v1', { status: 'In Progress' }));
    await changeVulnerabilityStatus('v1', 'Accepted Risk', 'Business decision', USER_ID, ORG_ID, { bulkAction: true });

    const audit = m.auditCreate.mock.calls[0][0];
    expect(audit.changed_fields).toContain('status');
    expect(audit.changed_fields).toContain('assigned_to');
  });
});

// ─── L: bulkAssignGroup ───────────────────────────────────────────────────────

describe('bulkAssignGroup', () => {
  it('L1: updates group field for each record', async () => {
    m.vulnsGetOne
      .mockResolvedValueOnce(makeVuln('v1'))
      .mockResolvedValueOnce(makeVuln('v2'));

    await bulkAssignGroup(['v1', 'v2'], 'grp_123', ORG_ID);

    const calls = m.vulnsUpdate.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toMatchObject({ group: 'grp_123' });
    expect(calls[1][1]).toMatchObject({ group: 'grp_123' });
  });

  it('L2: writes audit entry with bulk_action:true for each record', async () => {
    m.vulnsGetOne.mockResolvedValue(makeVuln('v1', { group: null }));

    await bulkAssignGroup(['v1'], 'grp_123', ORG_ID);

    const audit = m.auditCreate.mock.calls[0][0];
    expect(audit.action).toBe('update');
    expect(audit.changed_fields).toEqual(['group']);
    expect(audit.new_values.bulk_action).toBe(true);
    expect(audit.new_values.group).toBe('grp_123');
  });

  it('L3: passing null/empty groupId unassigns (sets group to null)', async () => {
    m.vulnsGetOne.mockResolvedValue(makeVuln('v1', { group: 'grp_old' }));

    await bulkAssignGroup(['v1'], null, ORG_ID);

    const updateCall = m.vulnsUpdate.mock.calls[0][1];
    expect(updateCall.group).toBeNull();
  });

  it('L4: returns correct succeeded/failed/total counts on full success', async () => {
    m.vulnsGetOne.mockResolvedValue(makeVuln('v1'));
    m.vulnsGetOne.mockResolvedValue(makeVuln('v2'));

    const result = await bulkAssignGroup(['v1', 'v2'], 'grp_123', ORG_ID);
    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('L5: partial failure — returns correct counts when one record fails', async () => {
    m.vulnsGetOne
      .mockResolvedValueOnce(makeVuln('v1'))
      .mockRejectedValueOnce(new Error('not found'));

    const result = await bulkAssignGroup(['v1', 'v2'], 'grp_123', ORG_ID);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.total).toBe(2);
  });

  it('L6: all failed — returns succeeded=0, failed=total', async () => {
    m.vulnsGetOne.mockRejectedValue(new Error('network error'));

    const result = await bulkAssignGroup(['v1', 'v2', 'v3'], 'grp_x', ORG_ID);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(3);
    expect(result.total).toBe(3);
  });
});

// ─── M: bulkAssignUser ────────────────────────────────────────────────────────

describe('bulkAssignUser', () => {
  it('M1: updates assigned_to field for each record', async () => {
    m.vulnsGetOne
      .mockResolvedValueOnce(makeVuln('v1'))
      .mockResolvedValueOnce(makeVuln('v2'));

    await bulkAssignUser(['v1', 'v2'], USER_ID, ORG_ID);

    const calls = m.vulnsUpdate.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toMatchObject({ assigned_to: USER_ID });
    expect(calls[1][1]).toMatchObject({ assigned_to: USER_ID });
  });

  it('M2: writes audit entry with bulk_action:true', async () => {
    m.vulnsGetOne.mockResolvedValue(makeVuln('v1'));

    await bulkAssignUser(['v1'], USER_ID, ORG_ID);

    const audit = m.auditCreate.mock.calls[0][0];
    expect(audit.action).toBe('update');
    expect(audit.changed_fields).toEqual(['assigned_to']);
    expect(audit.new_values.bulk_action).toBe(true);
    expect(audit.new_values.assigned_to).toBe(USER_ID);
  });

  it('M3: passing null userId unassigns (sets assigned_to to null)', async () => {
    m.vulnsGetOne.mockResolvedValue(makeVuln('v1', { assigned_to: USER_ID }));

    await bulkAssignUser(['v1'], null, ORG_ID);

    const updateCall = m.vulnsUpdate.mock.calls[0][1];
    expect(updateCall.assigned_to).toBeNull();
  });

  it('M4: returns correct counts on full success', async () => {
    m.vulnsGetOne.mockResolvedValue(makeVuln('v1'));

    const result = await bulkAssignUser(['v1', 'v2'], USER_ID, ORG_ID);
    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('M5: partial failure — correct counts', async () => {
    m.vulnsGetOne
      .mockResolvedValueOnce(makeVuln('v1'))
      .mockRejectedValueOnce(new Error('error'));

    const result = await bulkAssignUser(['v1', 'v2'], USER_ID, ORG_ID);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('M6: previous_values in audit reflects the record before update', async () => {
    m.vulnsGetOne.mockResolvedValue(makeVuln('v1', { assigned_to: 'usr_old' }));

    await bulkAssignUser(['v1'], USER_ID, ORG_ID);

    const audit = m.auditCreate.mock.calls[0][0];
    expect(audit.previous_values).toMatchObject({ assigned_to: 'usr_old' });
  });
});

// ─── N: bulkDeleteVulnerabilities ────────────────────────────────────────────

describe('bulkDeleteVulnerabilities', () => {
  it('N1: calls delete for each ID', async () => {
    m.vulnsGetOne.mockResolvedValue(makeVuln('v1'));

    await bulkDeleteVulnerabilities(['v1', 'v2'], ORG_ID);

    expect(m.vulnsDelete.mock.calls).toHaveLength(2);
  });

  it('N2: returns correct counts on full success', async () => {
    m.vulnsGetOne.mockResolvedValue(makeVuln('v1'));

    const result = await bulkDeleteVulnerabilities(['v1', 'v2'], ORG_ID);
    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('N3: partial failure — counts correct when one delete fails', async () => {
    m.vulnsGetOne
      .mockResolvedValueOnce(makeVuln('v1'))
      .mockRejectedValueOnce(new Error('not found'));

    const result = await bulkDeleteVulnerabilities(['v1', 'v2'], ORG_ID);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('N4: writes audit entry for each record deleted', async () => {
    m.vulnsGetOne.mockResolvedValue(makeVuln('v1'));

    await bulkDeleteVulnerabilities(['v1', 'v2'], ORG_ID);

    // One audit entry per delete (written before the actual delete)
    expect(m.auditCreate.mock.calls).toHaveLength(2);
    m.auditCreate.mock.calls.forEach(([payload]) => {
      expect(payload.action).toBe('delete');
    });
  });
});
