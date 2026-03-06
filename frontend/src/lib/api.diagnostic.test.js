/**
 * api.diagnostic.test.js
 *
 * Regression tests for the organization ID propagation chain.
 * Originally written as diagnostics; updated after the fix to serve as guards.
 *
 * The fixed architecture:
 *   authRefresh() populates pb.authStore.model (full DB record, includes org)
 *   → initializeUser() reads organization from pb.authStore.model (no getOne())
 *   → organizationIdRef.current = orgId  (set in App.jsx loadData)
 *   → createVulnerability(vuln, organizationIdRef.current)
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
  authStoreRecord:    null,
  vulnsCreate:        vi.fn(),
  vulnsGetFullList:   vi.fn(),
  auditCreate:        vi.fn(),
  weightsGetFullList: vi.fn(),
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
      switch (name) {
        case 'vulnerabilities':
          return { create: m.vulnsCreate, getFullList: m.vulnsGetFullList };
        case 'vulnerability_audit_log':
          return { create: m.auditCreate };
        case 'scoring_weights':
          return { getFullList: m.weightsGetFullList };
        default:
          return {};
      }
    }),
  },
  getCurrentUser:  () => m.authStoreRecord,
  isAuthenticated: () => !!m.authStoreRecord,
  logout: vi.fn(),
}));

import { initializeUser, createVulnerability } from './api.js';
import { pb } from './pocketbase.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org_test_abc123';

/**
 * AUTH_STORE_USER: what pb.authStore.model contains after authRefresh().
 * authRefresh() fetches the full user record from the DB, so `organization`
 * is populated with the real org ID.
 */
const AUTH_STORE_USER = {
  id:           'usr_001',
  email:        'analyst@corp.com',
  organization: ORG_ID,
  role:         'analyst',
};

const VULN = {
  cveId:               'CVE-2024-00001',
  title:               'Regression Test Vuln',
  cvssScore:           8.1,
  assetCriticality:    'Critical',
  internetFacing:      true,
  exploitability:      'Actively Exploited',
  daysSinceDiscovery:  45,
  affectedAssetCount:  120,
  compositeScore:      88,
  riskTier:            'Critical',
};

const CREATED_RECORD = {
  id: 'vuln_001', ...VULN,
  organization: ORG_ID, status: 'open', group: '',
  created: '2024-01-01T00:00:00Z', updated: '2024-01-01T00:00:00Z',
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  global.sessionStorage.clear();
  // Reset module-level currentOrgId: call initializeUser with null auth.
  m.authStoreRecord = null;
  initializeUser();
  // Default happy-path state.
  m.authStoreRecord = AUTH_STORE_USER;
  m.vulnsCreate.mockResolvedValue(CREATED_RECORD);
  m.auditCreate.mockResolvedValue({ id: 'audit_001' });
  m.weightsGetFullList.mockResolvedValue([]);
  m.vulnsGetFullList.mockResolvedValue([]);
});

// ─── SUITE A: initializeUser() reads from pb.authStore.model ──────────────────

describe('A — initializeUser(): reads organization from pb.authStore.model', () => {

  it('A1: returns the organization string from the auth store record', () => {
    const orgId = initializeUser();
    expect(orgId).toBe(ORG_ID);
  });

  it('A2: is now synchronous — no network call made', () => {
    // pb.collection is the mock spy; it should never be called by initializeUser()
    initializeUser();
    expect(pb.collection).not.toHaveBeenCalled();
  });

  it('A3: caches the org ID in sessionStorage', () => {
    initializeUser();
    expect(global.sessionStorage.getItem('pb_org_id')).toBe(ORG_ID);
  });

  it('A4: returns null when authStore.model is null (not logged in)', () => {
    m.authStoreRecord = null;
    expect(initializeUser()).toBeNull();
  });

  it('A5: returns null when organization field is null', () => {
    m.authStoreRecord = { ...AUTH_STORE_USER, organization: null };
    expect(initializeUser()).toBeNull();
  });

  it('A6: returns null when organization field is empty string', () => {
    // || null converts falsy '' to null (unlike ?? which would keep '')
    m.authStoreRecord = { ...AUTH_STORE_USER, organization: '' };
    expect(initializeUser()).toBeNull();
  });

  it('A7: does NOT throw under any auth store state — always returns synchronously', () => {
    m.authStoreRecord = null;
    expect(() => initializeUser()).not.toThrow();
    m.authStoreRecord = { id: 'x', organization: ORG_ID };
    expect(() => initializeUser()).not.toThrow();
  });
});

// ─── SUITE B: createVulnerability() org ID propagation ────────────────────────

describe('B — createVulnerability(): organization ID reaches PocketBase', () => {

  it('B1: uses the explicit parameter when provided', async () => {
    await createVulnerability(VULN, ORG_ID);
    expect(m.vulnsCreate.mock.calls[0][0].organization).toBe(ORG_ID);
  });

  it('B2: falls back to currentOrgId when parameter is null', async () => {
    initializeUser();              // sets currentOrgId = ORG_ID
    m.vulnsCreate.mockClear();
    await createVulnerability(VULN, null);
    expect(m.vulnsCreate.mock.calls[0][0].organization).toBe(ORG_ID);
  });

  it('B3: falls back to sessionStorage when param and currentOrgId are both null', async () => {
    m.authStoreRecord = null;
    initializeUser();              // currentOrgId = null
    global.sessionStorage.setItem('pb_org_id', ORG_ID);
    await createVulnerability(VULN, null);
    expect(m.vulnsCreate.mock.calls[0][0].organization).toBe(ORG_ID);
  });
});

// ─── SUITE C: _writeVulnAudit() uses effectiveOrgId ──────────────────────────

describe('C — _writeVulnAudit(): audit entry written even when param is null', () => {

  it('C1: audit entry IS written when org param is null but currentOrgId is set', async () => {
    initializeUser();              // currentOrgId = ORG_ID
    m.vulnsCreate.mockClear();
    m.auditCreate.mockClear();

    await createVulnerability(VULN, null);  // null param — stale closure simulation

    // The vulnerability should be created with the correct org
    expect(m.vulnsCreate.mock.calls[0][0].organization).toBe(ORG_ID);
    // The audit entry should also be written (was silently dropped before the fix)
    expect(m.auditCreate).toHaveBeenCalledOnce();
    expect(m.auditCreate.mock.calls[0][0].organization).toBe(ORG_ID);
  });

  it('C2: audit entry uses the same effectiveOrgId as the create call', async () => {
    await createVulnerability(VULN, ORG_ID);
    expect(m.auditCreate.mock.calls[0][0].organization).toBe(ORG_ID);
  });
});

// ─── SUITE D: End-to-end happy path ───────────────────────────────────────────

describe('D — End-to-end: authRefresh → initializeUser → createVulnerability', () => {

  it('D1: org ID correctly flows from auth store through to PocketBase create', async () => {
    // authRefresh() has populated pb.authStore.record.organization = ORG_ID
    // (simulated by m.authStoreRecord = AUTH_STORE_USER in beforeEach)

    const orgId = initializeUser();
    expect(orgId).toBe(ORG_ID);

    await createVulnerability(VULN, orgId);
    expect(m.vulnsCreate.mock.calls[0][0].organization).toBe(ORG_ID);
    expect(m.auditCreate.mock.calls[0][0].organization).toBe(ORG_ID);
  });

  it('D2: initializeUser() is now infallible — loadData catch no longer fires from it', () => {
    // initializeUser() is synchronous and reads from memory; it cannot throw.
    // This means the only throw in loadData is from authRefresh() itself.
    m.authStoreRecord = null;
    expect(() => initializeUser()).not.toThrow();
    m.authStoreRecord = AUTH_STORE_USER;
    expect(() => initializeUser()).not.toThrow();
  });
});
