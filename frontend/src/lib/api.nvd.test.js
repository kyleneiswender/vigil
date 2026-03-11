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
      return {};
    }),
  },
  getCurrentUser:  () => m.authStoreRecord,
  isAuthenticated: () => !!m.authStoreRecord,
  logout: vi.fn(),
}));

import { initializeUser, lookupNvd, fetchOrgSettings, updateOrgSettings } from './api.js';

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

  it('I1: returns the first record when list has entries', async () => {
    const result = await fetchOrgSettings(ORG_ID);
    expect(result).toEqual(EXISTING_SETTINGS);
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
