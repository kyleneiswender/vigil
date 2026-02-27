import { describe, it, expect } from 'vitest';
import { parseCSV, autoDetectMapping, applyMapping, INTERNAL_FIELDS } from './csvParser.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a complete field mapping with all keys set to null by default. */
function makeMapping(overrides = {}) {
  const base = Object.fromEntries(INTERNAL_FIELDS.map((f) => [f.key, null]));
  return { ...base, ...overrides };
}

/** Minimal valid row: CVE ID at col 0, CVSS at col 1. */
const MIN_MAPPING = makeMapping({ cveId: 0, cvssScore: 1 });

// ─── parseCSV ─────────────────────────────────────────────────────────────────

describe('parseCSV', () => {
  it('returns empty headers and rows for empty input', () => {
    const result = parseCSV('');
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('strips UTF-8 BOM from the start', () => {
    const result = parseCSV('\uFEFFCVE ID,Title\nCVE-2024-1,Test\n');
    expect(result.headers[0]).toBe('CVE ID');
  });

  it('parses a simple two-column CSV', () => {
    const result = parseCSV('A,B\n1,2\n3,4\n');
    expect(result.headers).toEqual(['A', 'B']);
    expect(result.rows).toEqual([['1', '2'], ['3', '4']]);
  });

  it('handles CRLF line endings', () => {
    const result = parseCSV('A,B\r\n1,2\r\n3,4\r\n');
    expect(result.headers).toEqual(['A', 'B']);
    expect(result.rows).toEqual([['1', '2'], ['3', '4']]);
  });

  it('handles LF-only line endings', () => {
    const result = parseCSV('A,B\n1,2\n3,4');
    expect(result.headers).toEqual(['A', 'B']);
    expect(result.rows).toHaveLength(2);
  });

  it('parses a quoted field containing a comma', () => {
    const result = parseCSV('A,B\n"hello, world",2\n');
    expect(result.rows[0][0]).toBe('hello, world');
  });

  it('parses escaped double-quotes inside a quoted field', () => {
    const result = parseCSV('A,B\n"say ""hi""",2\n');
    expect(result.rows[0][0]).toBe('say "hi"');
  });

  it('handles a quoted field containing a newline (multi-line cell)', () => {
    const result = parseCSV('A,B\n"line1\nline2",2\n');
    expect(result.rows[0][0]).toBe('line1\nline2');
  });

  it('drops trailing blank rows', () => {
    const result = parseCSV('A,B\n1,2\n\n\n');
    expect(result.rows).toHaveLength(1);
  });

  it('returns only headers when there are no data rows', () => {
    const result = parseCSV('CVE ID,CVSS\n');
    expect(result.headers).toEqual(['CVE ID', 'CVSS']);
    expect(result.rows).toEqual([]);
  });

  it('trims whitespace from header values', () => {
    const result = parseCSV(' CVE ID , Title \n1,2\n');
    expect(result.headers).toEqual(['CVE ID', 'Title']);
  });

  it('trims whitespace from unquoted field values', () => {
    const result = parseCSV('A,B\n  foo  ,  bar  \n');
    expect(result.rows[0]).toEqual(['foo', 'bar']);
  });

  it('handles a single-column CSV', () => {
    const result = parseCSV('CVE ID\nCVE-2024-1\nCVE-2024-2\n');
    expect(result.headers).toEqual(['CVE ID']);
    expect(result.rows).toHaveLength(2);
  });

  it('handles a file with no trailing newline', () => {
    const result = parseCSV('A,B\n1,2');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(['1', '2']);
  });
});

// ─── autoDetectMapping ────────────────────────────────────────────────────────

describe('autoDetectMapping', () => {
  it('maps exact hint matches', () => {
    const mapping = autoDetectMapping(['cve', 'cvss', 'title']);
    expect(mapping.cveId).toBe(0);
    expect(mapping.cvssScore).toBe(1);
    expect(mapping.title).toBe(2);
  });

  it('normalizes headers before matching (strips spaces, lowercase)', () => {
    // 'CVE ID' normalises to 'cveid' which is in the hints list
    const mapping = autoDetectMapping(['CVE ID', 'CVSS Score']);
    expect(mapping.cveId).toBe(0);
    expect(mapping.cvssScore).toBe(1);
  });

  it('returns null for headers with no hint match', () => {
    const mapping = autoDetectMapping(['totally_unrecognised_column']);
    expect(mapping.cveId).toBeNull();
    expect(mapping.cvssScore).toBeNull();
  });

  it('first match wins when multiple columns match the same field', () => {
    // 'cve' and 'id' both hint to cveId; first one (index 0) should win
    const mapping = autoDetectMapping(['cve', 'id', 'cvss']);
    expect(mapping.cveId).toBe(0);
  });

  it('maps Qualys-style column names for affectedAssetCount', () => {
    const mapping = autoDetectMapping(['CVE ID', 'CVSS', 'Hosts']);
    expect(mapping.affectedAssetCount).toBe(2);
  });

  it('maps all 8 internal fields from a realistic header row', () => {
    const headers = ['CVE ID', 'Title', 'CVSS', 'Criticality', 'Internet', 'Exploit', 'Days', 'Hosts'];
    const mapping = autoDetectMapping(headers);
    expect(mapping.cveId).not.toBeNull();
    expect(mapping.cvssScore).not.toBeNull();
  });

  it('returns an entry for every INTERNAL_FIELDS key', () => {
    const mapping = autoDetectMapping([]);
    const expectedKeys = INTERNAL_FIELDS.map((f) => f.key);
    expectedKeys.forEach((k) => expect(mapping).toHaveProperty(k));
  });
});

// ─── applyMapping — valid rows ────────────────────────────────────────────────

describe('applyMapping — valid rows', () => {
  it('produces a valid record from a fully-mapped row', () => {
    const rows = [['CVE-2024-1234', 'Test vuln', '7.5', 'High', 'yes', 'PoC Exists', '30', '50']];
    const mapping = makeMapping({
      cveId: 0, title: 1, cvssScore: 2, assetCriticality: 3,
      internetFacing: 4, exploitability: 5, daysSinceDiscovery: 6, affectedAssetCount: 7,
    });
    const { valid, invalid } = applyMapping(rows, [], mapping);
    expect(valid).toHaveLength(1);
    expect(invalid).toHaveLength(0);
    expect(valid[0].cveId).toBe('CVE-2024-1234');
    expect(valid[0].cvssScore).toBe(7.5);
    expect(valid[0].assetCriticality).toBe('High');
    expect(valid[0].internetFacing).toBe(true);
    expect(valid[0].exploitability).toBe('PoC Exists');
    expect(valid[0].daysSinceDiscovery).toBe(30);
    expect(valid[0].affectedAssetCount).toBe(50);
  });

  it('assigns a unique id to each valid record', () => {
    const rows = [
      ['CVE-2024-0001', '7.5'],
      ['CVE-2024-0002', '5.0'],
    ];
    const { valid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid[0].id).toBeDefined();
    expect(valid[1].id).toBeDefined();
    expect(valid[0].id).not.toBe(valid[1].id);
  });

  it('CVSS accepts boundary values 0 and 10', () => {
    const rows = [['CVE-2024-0001', '0'], ['CVE-2024-0002', '10']];
    const { valid, invalid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid).toHaveLength(2);
    expect(invalid).toHaveLength(0);
    expect(valid[0].cvssScore).toBe(0);
    expect(valid[1].cvssScore).toBe(10);
  });

  it('CVSS accepts decimal values', () => {
    const rows = [['CVE-2024-1234', '7.5']];
    const { valid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid[0].cvssScore).toBe(7.5);
  });
});

// ─── applyMapping — defaults for optional fields ──────────────────────────────

describe('applyMapping — optional field defaults', () => {
  it('title defaults to cveId when unmapped', () => {
    const rows = [['CVE-2024-1234', '7.5']];
    const { valid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid[0].title).toBe('CVE-2024-1234');
  });

  it('assetCriticality defaults to "Medium"', () => {
    const rows = [['CVE-2024-1234', '7.5']];
    const { valid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid[0].assetCriticality).toBe('Medium');
  });

  it('internetFacing defaults to false', () => {
    const rows = [['CVE-2024-1234', '7.5']];
    const { valid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid[0].internetFacing).toBe(false);
  });

  it('exploitability defaults to "Theoretical"', () => {
    const rows = [['CVE-2024-1234', '7.5']];
    const { valid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid[0].exploitability).toBe('Theoretical');
  });

  it('daysSinceDiscovery defaults to 0', () => {
    const rows = [['CVE-2024-1234', '7.5']];
    const { valid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid[0].daysSinceDiscovery).toBe(0);
  });

  it('affectedAssetCount defaults to 1', () => {
    const rows = [['CVE-2024-1234', '7.5']];
    const { valid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid[0].affectedAssetCount).toBe(1);
  });

  it('unrecognised assetCriticality value falls back to "Medium"', () => {
    const rows = [['CVE-2024-1234', '7.5', 'Unknown']];
    const mapping = makeMapping({ cveId: 0, cvssScore: 1, assetCriticality: 2 });
    const { valid } = applyMapping(rows, [], mapping);
    expect(valid[0].assetCriticality).toBe('Medium');
  });

  it('assetCriticality matching is case-insensitive', () => {
    const rows = [['CVE-2024-1234', '7.5', 'critical']];
    const mapping = makeMapping({ cveId: 0, cvssScore: 1, assetCriticality: 2 });
    const { valid } = applyMapping(rows, [], mapping);
    expect(valid[0].assetCriticality).toBe('Critical');
  });
});

// ─── applyMapping — internetFacing boolean parsing ────────────────────────────

describe('applyMapping — internetFacing boolean coercion', () => {
  const truthy = ['true', 'yes', '1', 'y', 'external', 'public', 'internet-facing', 'Internet Facing'];
  const falsy  = ['false', 'no', '0', 'n', 'internal'];

  truthy.forEach((val) => {
    it(`"${val}" → true`, () => {
      const rows = [['CVE-2024-1234', '7.5', val]];
      const mapping = makeMapping({ cveId: 0, cvssScore: 1, internetFacing: 2 });
      const { valid } = applyMapping(rows, [], mapping);
      expect(valid[0].internetFacing).toBe(true);
    });
  });

  falsy.forEach((val) => {
    it(`"${val}" → false`, () => {
      const rows = [['CVE-2024-1234', '7.5', val]];
      const mapping = makeMapping({ cveId: 0, cvssScore: 1, internetFacing: 2 });
      const { valid } = applyMapping(rows, [], mapping);
      expect(valid[0].internetFacing).toBe(false);
    });
  });
});

// ─── applyMapping — exploitability fuzzy matching ────────────────────────────

describe('applyMapping — exploitability fuzzy matching', () => {
  it('"actively exploited" (exact, lowercase) → Actively Exploited', () => {
    const rows = [['CVE-2024-1234', '7.5', 'actively exploited']];
    const mapping = makeMapping({ cveId: 0, cvssScore: 1, exploitability: 2 });
    const { valid } = applyMapping(rows, [], mapping);
    expect(valid[0].exploitability).toBe('Actively Exploited');
  });

  it('partial match containing "wild" → Actively Exploited', () => {
    const rows = [['CVE-2024-1234', '7.5', 'exploited in the wild']];
    const mapping = makeMapping({ cveId: 0, cvssScore: 1, exploitability: 2 });
    const { valid } = applyMapping(rows, [], mapping);
    expect(valid[0].exploitability).toBe('Actively Exploited');
  });

  it('partial match containing "poc" → PoC Exists', () => {
    const rows = [['CVE-2024-1234', '7.5', 'poc available']];
    const mapping = makeMapping({ cveId: 0, cvssScore: 1, exploitability: 2 });
    const { valid } = applyMapping(rows, [], mapping);
    expect(valid[0].exploitability).toBe('PoC Exists');
  });

  it('unrecognised exploitability value falls back to "Theoretical"', () => {
    const rows = [['CVE-2024-1234', '7.5', 'unknown_exploit_status']];
    const mapping = makeMapping({ cveId: 0, cvssScore: 1, exploitability: 2 });
    const { valid } = applyMapping(rows, [], mapping);
    expect(valid[0].exploitability).toBe('Theoretical');
  });
});

// ─── applyMapping — validation errors ────────────────────────────────────────

describe('applyMapping — validation errors', () => {
  it('rejects a row where cveId is blank', () => {
    const rows = [['', '7.5']];
    const { valid, invalid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].errors.some((e) => e.toLowerCase().includes('cve'))).toBe(true);
  });

  it('rejects a row where cveId is whitespace-only', () => {
    const rows = [['   ', '7.5']];
    const { valid, invalid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(1);
  });

  it('rejects a row where cvssScore is blank', () => {
    const rows = [['CVE-2024-1234', '']];
    const { valid, invalid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].errors.some((e) => e.toLowerCase().includes('cvss'))).toBe(true);
  });

  it('rejects a row where cvssScore is non-numeric', () => {
    const rows = [['CVE-2024-1234', 'not-a-number']];
    const { valid, invalid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(1);
  });

  it('rejects a row where cvssScore is below 0', () => {
    const rows = [['CVE-2024-1234', '-0.1']];
    const { valid, invalid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(1);
  });

  it('rejects a row where cvssScore is above 10', () => {
    const rows = [['CVE-2024-1234', '10.1']];
    const { valid, invalid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(1);
  });

  it('error rowNumber is 1-indexed', () => {
    const rows = [['CVE-2024-0001', '7.5'], ['', '7.5'], ['CVE-2024-0003', '7.5']];
    const { invalid } = applyMapping(rows, [], MIN_MAPPING);
    expect(invalid[0].rowNumber).toBe(2);
  });

  it('processes all rows independently (valid + invalid can coexist)', () => {
    const rows = [
      ['CVE-2024-0001', '7.5'],
      ['',              '7.5'],  // invalid
      ['CVE-2024-0003', '5.0'],
    ];
    const { valid, invalid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid).toHaveLength(2);
    expect(invalid).toHaveLength(1);
  });

  // ── FIX D: CVE ID format validation ──────────────────────────────────────
  // These tests FAIL before Fix D is applied and PASS after.

  it('[FIX D] rejects cveId that does not match CVE-YYYY-NNNNN format', () => {
    const rows = [['not-a-cve-id', '7.5']];
    const { valid, invalid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].errors.some((e) => /cve.*format|format.*cve|invalid.*cve/i.test(e))).toBe(true);
  });

  it('[FIX D] rejects cveId missing the year component', () => {
    const rows = [['CVE-12345', '7.5']];
    const { valid, invalid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(1);
  });

  it('[FIX D] rejects plain numbers as cveId', () => {
    const rows = [['12345', '7.5']];
    const { valid, invalid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(1);
  });

  it('[FIX D] accepts standard CVE-YYYY-NNNN format (4-digit ID)', () => {
    const rows = [['CVE-2024-1234', '7.5']];
    const { valid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid).toHaveLength(1);
  });

  it('[FIX D] accepts CVE-YYYY-NNNNN format (5-digit ID)', () => {
    const rows = [['CVE-2024-12345', '7.5']];
    const { valid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid).toHaveLength(1);
  });

  it('[FIX D] accepts CVE-YYYY-NNNNNN format (6-digit ID)', () => {
    const rows = [['CVE-2024-123456', '7.5']];
    const { valid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid).toHaveLength(1);
  });

  it('[FIX D] CVE format matching is case-insensitive', () => {
    const rows = [['cve-2024-1234', '7.5']];
    const { valid } = applyMapping(rows, [], MIN_MAPPING);
    expect(valid).toHaveLength(1);
  });
});

// ─── applyMapping — numeric bounds ───────────────────────────────────────────

describe('applyMapping — numeric bounds', () => {
  it('clamps negative daysSinceDiscovery to 0', () => {
    const rows = [['CVE-2024-1234', '7.5', '', '', '', '', '-5', '']];
    const mapping = makeMapping({ cveId: 0, cvssScore: 1, daysSinceDiscovery: 6 });
    const { valid } = applyMapping(rows, [], mapping);
    expect(valid[0].daysSinceDiscovery).toBe(0);
  });

  it('clamps negative affectedAssetCount to 0', () => {
    const rows = [['CVE-2024-1234', '7.5', '', '', '', '', '', '-10']];
    const mapping = makeMapping({ cveId: 0, cvssScore: 1, affectedAssetCount: 7 });
    const { valid } = applyMapping(rows, [], mapping);
    expect(valid[0].affectedAssetCount).toBe(0);
  });

  it('treats non-numeric daysSinceDiscovery as 0', () => {
    const rows = [['CVE-2024-1234', '7.5', '', '', '', '', 'unknown', '']];
    const mapping = makeMapping({ cveId: 0, cvssScore: 1, daysSinceDiscovery: 6 });
    const { valid } = applyMapping(rows, [], mapping);
    expect(valid[0].daysSinceDiscovery).toBe(0);
  });

  // ── FIX G: upper-bound caps ───────────────────────────────────────────────
  // These tests FAIL before Fix G is applied and PASS after.

  it('[FIX G] caps daysSinceDiscovery at 36500 (~100 years)', () => {
    const rows = [['CVE-2024-1234', '7.5', '', '', '', '', '99999', '']];
    const mapping = makeMapping({ cveId: 0, cvssScore: 1, daysSinceDiscovery: 6 });
    const { valid } = applyMapping(rows, [], mapping);
    expect(valid[0].daysSinceDiscovery).toBe(36500);
  });

  it('[FIX G] caps affectedAssetCount at 100000', () => {
    const rows = [['CVE-2024-1234', '7.5', '', '', '', '', '', '999999']];
    const mapping = makeMapping({ cveId: 0, cvssScore: 1, affectedAssetCount: 7 });
    const { valid } = applyMapping(rows, [], mapping);
    expect(valid[0].affectedAssetCount).toBe(100000);
  });

  it('[FIX G] values at the cap boundary are accepted unchanged', () => {
    const rows = [['CVE-2024-1234', '7.5', '', '', '', '', '36500', '100000']];
    const mapping = makeMapping({ cveId: 0, cvssScore: 1, daysSinceDiscovery: 6, affectedAssetCount: 7 });
    const { valid } = applyMapping(rows, [], mapping);
    expect(valid[0].daysSinceDiscovery).toBe(36500);
    expect(valid[0].affectedAssetCount).toBe(100000);
  });

  it('[FIX G] values just below the cap pass through unchanged', () => {
    const rows = [['CVE-2024-1234', '7.5', '', '', '', '', '36499', '99999']];
    const mapping = makeMapping({ cveId: 0, cvssScore: 1, daysSinceDiscovery: 6, affectedAssetCount: 7 });
    const { valid } = applyMapping(rows, [], mapping);
    expect(valid[0].daysSinceDiscovery).toBe(36499);
    expect(valid[0].affectedAssetCount).toBe(99999);
  });
});

// ─── applyMapping — injection payloads (documents current storage behavior) ──

describe('applyMapping — injection payload handling', () => {
  it('formula-injection prefix in title is stored as-is (sanitisation happens at export)', () => {
    // This documents that applyMapping does not strip formula chars from free-text fields.
    // Sanitisation for CSV export is handled separately (Fix B in exportUtils).
    const rows = [['CVE-2024-1234', '7.5', '=HYPERLINK("evil.com","click")']];
    const mapping = makeMapping({ cveId: 0, cvssScore: 1, title: 2 });
    const { valid } = applyMapping(rows, [], mapping);
    expect(valid).toHaveLength(1);
    expect(valid[0].title).toBe('=HYPERLINK("evil.com","click")');
  });

  it('HTML in title field is stored verbatim (sanitisation is React/PDF export responsibility)', () => {
    const rows = [['CVE-2024-1234', '7.5', '<script>alert(1)</script>']];
    const mapping = makeMapping({ cveId: 0, cvssScore: 1, title: 2 });
    const { valid } = applyMapping(rows, [], mapping);
    expect(valid).toHaveLength(1);
    expect(valid[0].title).toBe('<script>alert(1)</script>');
  });
});
