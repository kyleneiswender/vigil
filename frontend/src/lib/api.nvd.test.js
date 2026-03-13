/**
 * api.nvd.test.js
 *
 * Unit tests for:
 *   lookupNvd       — NVD API lookup (uses native fetch, not PocketBase)
 *   fetchOrgSettings
 *   updateOrgSettings
 *
 * Mock pattern matches api.diagnostic.test.js:
 *   vi.hoisted() + vi.mock('./pocketbase.js') + sessionStorage polyfill.
 * Additionally stubs global.fetch per test for lookupNvd.
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
  authStoreRecord:        null,
  orgSettingsGetFullList: vi.fn(),
  orgSettingsCreate:      vi.fn(),
  orgSettingsUpdate:      vi.fn(),
  auditCreate:            vi.fn(),
  vulnsUpdate:            vi.fn(),
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
      if (name === 'org_settings') {
        return {
          getFullList: m.orgSettingsGetFullList,
          create:      m.orgSettingsCreate,
          update:      m.orgSettingsUpdate,
        };
      }
      if (name === 'vulnerability_audit_log') return { create: m.auditCreate };
      if (name === 'vulnerabilities')         return { update: m.vulnsUpdate };
      return {};
    }),
  },
  getCurrentUser:  () => m.authStoreRecord,
  isAuthenticated: () => !!m.authStoreRecord,
  logout: vi.fn(),
}));

import { initializeUser, lookupNvd, lookupEpss, fetchOrgSettings, updateOrgSettings, fetchKevCatalog, syncKevFeed, validateThresholds, validateDefaultWeights } from './api.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID   = 'org_abc123';
const AUTH_USER = { id: 'usr_admin', email: 'admin@corp.com', organization: ORG_ID, role: 'admin' };

const EXISTING_SETTINGS = { id: 'settings_001', organization: ORG_ID, nvd_api_key: 'key_old' };
const UPDATED_SETTINGS  = { id: 'settings_001', organization: ORG_ID, nvd_api_key: 'key_new' };
const CREATED_SETTINGS  = { id: 'settings_002', organization: ORG_ID, nvd_api_key: 'key_new' };

/** Build a minimal valid NVD API response for a single CVE. */
function makeNvdResponse({ withV3 = true, withV2 = false, noEnDescription = false } = {}) {
  const descriptions = noEnDescription
    ? [{ lang: 'es', value: 'Descripción en español' }]
    : [{ lang: 'en', value: 'A critical remote code execution vulnerability.' }];

  const metrics = {};
  if (withV3) {
    metrics.cvssMetricV31 = [{
      cvssData: { baseScore: 9.8, vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' },
    }];
  }
  if (withV2) {
    metrics.cvssMetricV2 = [{
      cvssData: { baseScore: 7.5, vectorString: 'AV:N/AC:L/Au:N/C:P/I:P/A:P' },
    }];
  }

  return {
    vulnerabilities: [{
      cve: { descriptions, metrics },
    }],
  };
}

/** Helper: stub global.fetch to return a JSON response. */
function mockFetchJson(status, body) {
  global.fetch = vi.fn().mockResolvedValue({
    ok:     status >= 200 && status < 300,
    status,
    json:   () => Promise.resolve(body),
  });
}

/** Helper: stub global.fetch to return a response whose .json() throws. */
function mockFetchMalformed(status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok:     status >= 200 && status < 300,
    status,
    json:   () => { throw new SyntaxError('Unexpected token'); },
  });
}

/** Helper: stub global.fetch to throw a network error. */
function mockFetchNetworkError() {
  global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  global.sessionStorage.clear();
  global.fetch = vi.fn(); // reset each test
  m.authStoreRecord = null;
  initializeUser(); // reset currentOrgId
  m.authStoreRecord = AUTH_USER;
  m.orgSettingsGetFullList.mockResolvedValue([EXISTING_SETTINGS]);
  m.orgSettingsCreate.mockResolvedValue(CREATED_SETTINGS);
  m.orgSettingsUpdate.mockResolvedValue(UPDATED_SETTINGS);
});

// ─── Suite H: lookupNvd() ─────────────────────────────────────────────────────

describe('H — lookupNvd(): NVD API lookup', () => {

  it('H1: successful v3 response — returns description, cvssV3Score, hasV3=true, hasV2Only=false', async () => {
    mockFetchJson(200, makeNvdResponse({ withV3: true }));
    const result = await lookupNvd('CVE-2021-44228');

    expect(result.error).toBeUndefined();
    expect(result.description).toBe('A critical remote code execution vulnerability.');
    expect(result.cvssV3Score).toBe(9.8);
    expect(result.cvssV3Vector).toBe('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H');
    expect(result.hasV3).toBe(true);
    expect(result.hasV2Only).toBe(false);
  });

  it('H2: v2 only response — hasV2Only=true, hasV3=false, cvssV3Score=null, cvssV2Score populated', async () => {
    mockFetchJson(200, makeNvdResponse({ withV3: false, withV2: true }));
    const result = await lookupNvd('CVE-2005-0001');

    expect(result.hasV3).toBe(false);
    expect(result.hasV2Only).toBe(true);
    expect(result.cvssV3Score).toBeNull();
    expect(result.cvssV2Score).toBe(7.5);
  });

  it('H3: empty vulnerabilities array → { error: "not_found" }', async () => {
    mockFetchJson(200, { vulnerabilities: [] });
    expect(await lookupNvd('CVE-0000-0001')).toEqual({ error: 'not_found' });
  });

  it('H4: HTTP 404 → { error: "not_found" }', async () => {
    mockFetchJson(404, {});
    expect(await lookupNvd('CVE-0000-0002')).toEqual({ error: 'not_found' });
  });

  it('H5: HTTP 403 → { error: "rate_limited" }', async () => {
    mockFetchJson(403, {});
    expect(await lookupNvd('CVE-2021-44228')).toEqual({ error: 'rate_limited' });
  });

  it('H6: HTTP 429 → { error: "rate_limited" }', async () => {
    mockFetchJson(429, {});
    expect(await lookupNvd('CVE-2021-44228')).toEqual({ error: 'rate_limited' });
  });

  it('H7: fetch throws (network error) → { error: "network_error" }', async () => {
    mockFetchNetworkError();
    expect(await lookupNvd('CVE-2021-44228')).toEqual({ error: 'network_error' });
  });

  it('H8: response.json() throws (malformed body) → { error: "malformed" }', async () => {
    mockFetchMalformed(200);
    expect(await lookupNvd('CVE-2021-44228')).toEqual({ error: 'malformed' });
  });

  it('H9: no English description in descriptions array → description: null', async () => {
    mockFetchJson(200, makeNvdResponse({ withV3: true, noEnDescription: true }));
    const result = await lookupNvd('CVE-2021-44228');
    expect(result.description).toBeNull();
    expect(result.cvssV3Score).toBe(9.8); // score still populated
  });

  it('H10: apiKey provided → "apiKey" header included in fetch call', async () => {
    mockFetchJson(200, makeNvdResponse({ withV3: true }));
    await lookupNvd('CVE-2021-44228', 'my-test-key');

    expect(global.fetch).toHaveBeenCalledOnce();
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/nvd-api/');
    expect(options.headers['apiKey']).toBe('my-test-key');
  });
});

// ─── Suite I: fetchOrgSettings() ─────────────────────────────────────────────

describe('I — fetchOrgSettings(): loads org settings from PocketBase', () => {

  it('I1: returns the first record when list has entries (augmented with defaults)', async () => {
    const result = await fetchOrgSettings(ORG_ID);
    // fetchOrgSettings now augments raw record with threshold/defaultWeights defaults
    expect(result).toMatchObject(EXISTING_SETTINGS);
    expect(result.criticalThreshold).toBe(80);
    expect(result.highThreshold).toBe(60);
    expect(result.mediumThreshold).toBe(40);
    expect(result.defaultWeights).toBeDefined();
    expect(m.orgSettingsGetFullList).toHaveBeenCalledOnce();
  });

  it('I2: returns null when list is empty', async () => {
    m.orgSettingsGetFullList.mockResolvedValue([]);
    expect(await fetchOrgSettings(ORG_ID)).toBeNull();
  });
});

// ─── Suite J: updateOrgSettings() ────────────────────────────────────────────

describe('J — updateOrgSettings(): upserts org settings', () => {

  it('J1: creates new record when fetchOrgSettings returns null', async () => {
    m.orgSettingsGetFullList.mockResolvedValue([]);
    await updateOrgSettings(ORG_ID, { nvd_api_key: 'key_new' });

    expect(m.orgSettingsCreate).toHaveBeenCalledOnce();
    expect(m.orgSettingsCreate.mock.calls[0][0]).toMatchObject({
      organization: ORG_ID,
      nvd_api_key:  'key_new',
    });
    expect(m.orgSettingsUpdate).not.toHaveBeenCalled();
  });

  it('J2: updates existing record using its id when one exists', async () => {
    await updateOrgSettings(ORG_ID, { nvd_api_key: 'key_new' });

    expect(m.orgSettingsUpdate).toHaveBeenCalledOnce();
    expect(m.orgSettingsUpdate.mock.calls[0][0]).toBe(EXISTING_SETTINGS.id);
    expect(m.orgSettingsUpdate.mock.calls[0][1]).toMatchObject({ nvd_api_key: 'key_new' });
    expect(m.orgSettingsCreate).not.toHaveBeenCalled();
  });

  it('J3: returns the saved record', async () => {
    const result = await updateOrgSettings(ORG_ID, { nvd_api_key: 'key_new' });
    expect(result).toEqual(UPDATED_SETTINGS);
  });
});

// ─── EPSS fixture ─────────────────────────────────────────────────────────────

/** Build a minimal valid FIRST.org EPSS API response for a single CVE. */
function makeEpssResponse(epss = '0.94320', percentile = '0.97120') {
  return {
    data: [{ cve: 'CVE-2021-44228', epss, percentile, date: '2024-01-01' }],
  };
}

// ─── Suite L: lookupEpss() ────────────────────────────────────────────────────

describe('L — lookupEpss(): EPSS API lookup', () => {

  it('L1: successful response — returns epssScore and epssPercentile as numbers', async () => {
    mockFetchJson(200, makeEpssResponse('0.94320', '0.97120'));
    const result = await lookupEpss('CVE-2021-44228');

    expect(result.error).toBeUndefined();
    expect(result.epssScore).toBeCloseTo(0.9432, 4);
    expect(result.epssPercentile).toBeCloseTo(0.9712, 4);
  });

  it('L2: empty data array → { error: "not_found" }', async () => {
    mockFetchJson(200, { data: [] });
    expect(await lookupEpss('CVE-0000-0001')).toEqual({ error: 'not_found' });
  });

  it('L3: missing data property → { error: "not_found" }', async () => {
    mockFetchJson(200, {});
    expect(await lookupEpss('CVE-0000-0002')).toEqual({ error: 'not_found' });
  });

  it('L4: HTTP error (non-2xx) → { error: "network_error" }', async () => {
    mockFetchJson(500, {});
    expect(await lookupEpss('CVE-2021-44228')).toEqual({ error: 'network_error' });
  });

  it('L5: fetch throws (network error) → { error: "network_error" }', async () => {
    mockFetchNetworkError();
    expect(await lookupEpss('CVE-2021-44228')).toEqual({ error: 'network_error' });
  });

  it('L6: response.json() throws (malformed body) → { error: "network_error" }', async () => {
    mockFetchMalformed(200);
    expect(await lookupEpss('CVE-2021-44228')).toEqual({ error: 'network_error' });
  });
});

// ─── Suite M: parallel lookup behavior ───────────────────────────────────────

describe('M — parallel lookup: NVD+EPSS independence via Promise.allSettled', () => {

  it('M1: EPSS failure does not prevent NVD data from being returned', async () => {
    // NVD call is first (call #1), EPSS is second (call #2)
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(makeNvdResponse({ withV3: true })) })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const [nvd, epss] = await Promise.allSettled([
      lookupNvd('CVE-2021-44228', null),
      lookupEpss('CVE-2021-44228'),
    ]);

    expect(nvd.status).toBe('fulfilled');
    expect(nvd.value.error).toBeUndefined();
    expect(nvd.value.description).toBe('A critical remote code execution vulnerability.');
    expect(nvd.value.cvssV3Score).toBe(9.8);

    expect(epss.status).toBe('fulfilled'); // allSettled never rejects
    expect(epss.value.error).toBe('network_error');
  });

  it('M2: NVD not_found does not prevent EPSS data from being returned', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ vulnerabilities: [] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(makeEpssResponse()) });

    const [nvd, epss] = await Promise.allSettled([
      lookupNvd('CVE-2021-44228', null),
      lookupEpss('CVE-2021-44228'),
    ]);

    expect(nvd.status).toBe('fulfilled');
    expect(nvd.value.error).toBe('not_found');

    expect(epss.status).toBe('fulfilled');
    expect(epss.value.error).toBeUndefined();
    expect(epss.value.epssScore).toBeCloseTo(0.9432, 4);
    expect(epss.value.epssPercentile).toBeCloseTo(0.9712, 4);
  });
});

// ─── KEV catalog fixture ──────────────────────────────────────────────────────

function makeKevCatalog(entries = []) {
  return {
    title: 'CISA Known Exploited Vulnerabilities Catalog',
    catalogVersion: '2024.01.01',
    dateReleased: '2024-01-01T00:00:00Z',
    count: entries.length,
    vulnerabilities: entries,
  };
}

const KEV_ENTRY_LOG4J = {
  cveID: 'CVE-2021-44228',
  vendorProject: 'Apache',
  product: 'Log4j',
  vulnerabilityName: 'Apache Log4j2 Remote Code Execution Vulnerability',
  dateAdded: '2021-12-10',
  shortDescription: 'Apache Log4j2 contains a remote code execution vulnerability.',
  requiredAction: 'Apply updates.',
  dueDate: '2021-12-24',
  notes: '',
};

const TRACKED_VULN = {
  id:              'vuln_001',
  cveId:           'CVE-2021-44228',
  isKev:           false,
  kevDateAdded:    null,
  exploitability:  'Theoretical',
};

// ─── Suite O: fetchKevCatalog() ───────────────────────────────────────────────

describe('O — fetchKevCatalog(): CISA KEV feed fetch', () => {

  it('O1: successful response — returns vulnerabilities array', async () => {
    mockFetchJson(200, makeKevCatalog([KEV_ENTRY_LOG4J]));
    const result = await fetchKevCatalog();

    expect(result.error).toBeUndefined();
    expect(Array.isArray(result.vulnerabilities)).toBe(true);
    expect(result.vulnerabilities[0].cveID).toBe('CVE-2021-44228');
  });

  it('O2: network error (fetch throws) → { error: "network_error" }', async () => {
    mockFetchNetworkError();
    expect(await fetchKevCatalog()).toEqual({ error: 'network_error' });
  });

  it('O3: malformed response (vulnerabilities not an array) → { error: "malformed" }', async () => {
    mockFetchJson(200, { vulnerabilities: 'not-an-array' });
    expect(await fetchKevCatalog()).toEqual({ error: 'malformed' });
  });
});

// ─── Suite P: syncKevFeed() ───────────────────────────────────────────────────

describe('P — syncKevFeed(): compare catalog against tracked vulnerabilities', () => {

  beforeEach(() => {
    m.vulnsUpdate.mockResolvedValue({ id: 'vuln_001', isKev: true });
    m.auditCreate.mockResolvedValue({ id: 'audit_001' });
    // orgSettingsGetFullList already set to return EXISTING_SETTINGS in outer beforeEach
  });

  it('P1: new match found — updates PocketBase record and returns cveId in newMatches', async () => {
    mockFetchJson(200, makeKevCatalog([KEV_ENTRY_LOG4J]));
    const result = await syncKevFeed([TRACKED_VULN], ORG_ID);

    expect(result.error).toBeNull();
    expect(result.newMatches).toEqual(['CVE-2021-44228']);
    expect(result.totalMatched).toBe(1);
    expect(result.lastSync).toBeTruthy();

    // PocketBase update called with correct KEV fields
    expect(m.vulnsUpdate).toHaveBeenCalledOnce();
    expect(m.vulnsUpdate.mock.calls[0][0]).toBe('vuln_001');
    expect(m.vulnsUpdate.mock.calls[0][1]).toMatchObject({
      isKev:          true,
      kevDateAdded:   '2021-12-10',
      exploitability: 'Actively Exploited',
    });

    // Audit log entry written
    expect(m.auditCreate).toHaveBeenCalledOnce();
    expect(m.auditCreate.mock.calls[0][0].system_generated).toBe(true);
  });

  it('P2: already-flagged record (isKev=true) is not updated again', async () => {
    mockFetchJson(200, makeKevCatalog([KEV_ENTRY_LOG4J]));
    const alreadyFlagged = { ...TRACKED_VULN, isKev: true };
    const result = await syncKevFeed([alreadyFlagged], ORG_ID);

    expect(result.newMatches).toHaveLength(0);
    expect(result.totalMatched).toBe(1); // still counted in total
    expect(m.vulnsUpdate).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
  });

  it('P3: no KEV matches in tracked vulnerabilities — returns empty newMatches', async () => {
    mockFetchJson(200, makeKevCatalog([KEV_ENTRY_LOG4J]));
    const unrelated = { ...TRACKED_VULN, cveId: 'CVE-2024-99999', id: 'vuln_002' };
    const result = await syncKevFeed([unrelated], ORG_ID);

    expect(result.error).toBeNull();
    expect(result.newMatches).toHaveLength(0);
    expect(result.totalMatched).toBe(0);
    expect(m.vulnsUpdate).not.toHaveBeenCalled();
  });

  it('P4: catalog network error — returns error without updating any records', async () => {
    mockFetchNetworkError();
    const result = await syncKevFeed([TRACKED_VULN], ORG_ID);

    expect(result.error).toBe('network_error');
    expect(result.newMatches).toHaveLength(0);
    expect(m.vulnsUpdate).not.toHaveBeenCalled();
  });
});

// ─── Suite Q — validateThresholds ────────────────────────────────────────────

describe('validateThresholds', () => {
  it('Q1: valid thresholds return { valid: true, error: null }', () => {
    const result = validateThresholds(80, 60, 40);
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it('Q2: critical === high is invalid', () => {
    const result = validateThresholds(60, 60, 40);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('Q3: critical < high is invalid', () => {
    const result = validateThresholds(50, 60, 40);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('Q4: high === medium is invalid', () => {
    const result = validateThresholds(80, 40, 40);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('Q5: high < medium is invalid', () => {
    const result = validateThresholds(80, 30, 40);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('Q6: medium = 0 is invalid (must be at least 1)', () => {
    const result = validateThresholds(80, 60, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('Q7: critical = 100 is invalid (must be at most 99)', () => {
    const result = validateThresholds(100, 60, 40);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('Q8: boundary values critical=99, high=2, medium=1 are valid', () => {
    const result = validateThresholds(99, 2, 1);
    expect(result.valid).toBe(true);
  });
});

// ─── Suite R2 — validateDefaultWeights ────────────────────────────────────────

describe('validateDefaultWeights', () => {
  const VALID_WEIGHTS = { criticality: 25, cvss: 20, assetCount: 15, exposure: 15, exploitability: 10, epss: 10, days: 5 };

  it('R2-1: weights summing to 100 are valid', () => {
    const result = validateDefaultWeights(VALID_WEIGHTS);
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it('R2-2: weights not summing to 100 are invalid', () => {
    const result = validateDefaultWeights({ ...VALID_WEIGHTS, criticality: 50 });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/100/);
  });

  it('R2-3: negative weight is invalid', () => {
    const result = validateDefaultWeights({ ...VALID_WEIGHTS, criticality: -5 });
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('R2-4: all zeros (sum=0) is invalid', () => {
    const zeros = { criticality: 0, cvss: 0, assetCount: 0, exposure: 0, exploitability: 0, epss: 0, days: 0 };
    const result = validateDefaultWeights(zeros);
    expect(result.valid).toBe(false);
  });

  it('R2-5: one factor 100, others 0 is valid', () => {
    const result = validateDefaultWeights({ criticality: 100, cvss: 0, assetCount: 0, exposure: 0, exploitability: 0, epss: 0, days: 0 });
    expect(result.valid).toBe(true);
  });
});
