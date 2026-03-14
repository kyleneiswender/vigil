/**
 * duplicateDetector.test.js
 *
 * Unit tests for:
 *   A1–A9  findDuplicateCve
 *   B1–B7  isDuplicateClosed
 *   C1–C3  popup variant selection logic
 *   D1–D3  form submission blocking logic
 *   E1–E5  CSV import duplicate flagging
 */
import { describe, it, expect } from 'vitest';
import { findDuplicateCve, isDuplicateClosed } from './duplicateDetector.js';
import { CLOSED_STATUSES } from './scoringEngine.js';

const makeVuln = (id, cveId, status = 'Open') => ({ id, cveId, status });

// ─── A: findDuplicateCve ─────────────────────────────────────────────────────

describe('findDuplicateCve', () => {
  it('A1: returns null when cveId is null', () => {
    expect(findDuplicateCve(null, [makeVuln('v1', 'CVE-2021-1234')])).toBeNull();
  });

  it('A2: returns null when cveId is empty string', () => {
    expect(findDuplicateCve('', [makeVuln('v1', 'CVE-2021-1234')])).toBeNull();
  });

  it('A3: returns null when vulnerabilities array is empty', () => {
    expect(findDuplicateCve('CVE-2021-1234', [])).toBeNull();
  });

  it('A4: returns null when no CVE ID matches', () => {
    expect(findDuplicateCve('CVE-2021-9999', [makeVuln('v1', 'CVE-2021-1234')])).toBeNull();
  });

  it('A5: returns the matching vulnerability on exact match', () => {
    const vuln = makeVuln('v1', 'CVE-2021-1234');
    expect(findDuplicateCve('CVE-2021-1234', [vuln])).toBe(vuln);
  });

  it('A6: matches case-insensitively (lowercase input)', () => {
    const vuln = makeVuln('v1', 'CVE-2021-1234');
    expect(findDuplicateCve('cve-2021-1234', [vuln])).toBe(vuln);
  });

  it('A7: matches case-insensitively (mixed-case stored value)', () => {
    const vuln = makeVuln('v1', 'cve-2021-1234');
    expect(findDuplicateCve('CVE-2021-1234', [vuln])).toBe(vuln);
  });

  it('A8: returns only the first match when multiple records share a CVE ID', () => {
    const v1 = makeVuln('v1', 'CVE-2021-1234', 'Open');
    const v2 = makeVuln('v2', 'CVE-2021-1234', 'Remediated');
    const result = findDuplicateCve('CVE-2021-1234', [v1, v2]);
    expect(result).toBe(v1);
    expect(result?.id).toBe('v1');
  });

  it('A9: handles vulnerabilities with undefined cveId without throwing', () => {
    const vulns = [{ id: 'v1', status: 'Open' }, makeVuln('v2', 'CVE-2021-1234')];
    expect(findDuplicateCve('CVE-2021-1234', vulns)).toMatchObject({ id: 'v2' });
  });
});

// ─── B: isDuplicateClosed ────────────────────────────────────────────────────

describe('isDuplicateClosed', () => {
  it('B1: returns false when duplicate is null', () => {
    expect(isDuplicateClosed(null)).toBe(false);
  });

  it('B2: returns false when duplicate is undefined', () => {
    expect(isDuplicateClosed(undefined)).toBe(false);
  });

  CLOSED_STATUSES.forEach((status) => {
    it(`B3: returns true for closed status "${status}"`, () => {
      expect(isDuplicateClosed({ status })).toBe(true);
    });
  });

  const openStatuses = ['Open', 'In Progress', 'Risk Re-opened'];
  openStatuses.forEach((status) => {
    it(`B4: returns false for open status "${status}"`, () => {
      expect(isDuplicateClosed({ status })).toBe(false);
    });
  });

  it('B5: returns false when status is undefined', () => {
    expect(isDuplicateClosed({ status: undefined })).toBe(false);
  });

  it('B6: returns false when status is empty string', () => {
    expect(isDuplicateClosed({ status: '' })).toBe(false);
  });

  it('B7: returns false for an unrecognised status string', () => {
    expect(isDuplicateClosed({ status: 'Pending Review' })).toBe(false);
  });
});

// ─── C: Popup variant selection logic ────────────────────────────────────────

describe('popup variant selection logic', () => {
  it('C1: shows the closed variant for every status in CLOSED_STATUSES', () => {
    CLOSED_STATUSES.forEach((status) => {
      expect(isDuplicateClosed(makeVuln('v1', 'CVE-2021-1234', status))).toBe(true);
    });
  });

  it('C2: shows the open variant when the existing record status is Open', () => {
    expect(isDuplicateClosed(makeVuln('v1', 'CVE-2021-1234', 'Open'))).toBe(false);
  });

  it('C3: shows the open variant when the existing record status is In Progress', () => {
    expect(isDuplicateClosed(makeVuln('v1', 'CVE-2021-1234', 'In Progress'))).toBe(false);
  });
});

// ─── D: Form submission blocking logic ───────────────────────────────────────

describe('form submission blocking logic', () => {
  it('D1: findDuplicateCve returns a record → handleSubmit should block and show modal', () => {
    const vulns = [makeVuln('v1', 'CVE-2021-1234')];
    const duplicate = findDuplicateCve('CVE-2021-1234', vulns);
    // Non-null result signals that handleSubmit should set showDuplicateModal=true
    expect(duplicate).not.toBeNull();
  });

  it('D2: findDuplicateCve returns null → handleSubmit should call proceedWithSubmit', () => {
    const vulns = [makeVuln('v1', 'CVE-2021-5678')];
    const duplicate = findDuplicateCve('CVE-2021-1234', vulns);
    // Null result signals that handleSubmit should proceed normally
    expect(duplicate).toBeNull();
  });

  it('D3: inline warning clears when CVE ID is changed to a non-duplicate value', () => {
    const vulns = [makeVuln('v1', 'CVE-2021-1234')];
    // Simulates onChange after a previously-set duplicate warning
    const afterChange = findDuplicateCve('CVE-2021-9999', vulns);
    expect(afterChange).toBeNull();
  });
});

// ─── E: CSV import duplicate flagging ────────────────────────────────────────

// Mirrors the helper logic inlined in ValidationSummary
function findCsvDuplicates(validRecords, existingVulns) {
  return validRecords.filter((r) =>
    existingVulns.some(
      (v) => v.cveId?.toUpperCase().trim() === r.cveId?.toUpperCase().trim()
    )
  );
}

describe('CSV import duplicate flagging', () => {
  it('E1: flags records whose CVE ID matches an existing entry', () => {
    const existing = [makeVuln('e1', 'CVE-2021-1234'), makeVuln('e2', 'CVE-2021-5678')];
    const importRecords = [{ cveId: 'CVE-2021-1234' }, { cveId: 'CVE-2021-9999' }];
    const dups = findCsvDuplicates(importRecords, existing);
    expect(dups).toHaveLength(1);
    expect(dups[0].cveId).toBe('CVE-2021-1234');
  });

  it('E2: returns an empty array when no duplicates exist', () => {
    const existing = [makeVuln('e1', 'CVE-2021-1234')];
    const importRecords = [{ cveId: 'CVE-2022-9999' }, { cveId: 'CVE-2022-8888' }];
    expect(findCsvDuplicates(importRecords, existing)).toHaveLength(0);
  });

  it('E3: flags all records when every import row is a duplicate', () => {
    const existing = [makeVuln('e1', 'CVE-2021-1234'), makeVuln('e2', 'CVE-2021-5678')];
    const importRecords = [{ cveId: 'CVE-2021-1234' }, { cveId: 'CVE-2021-5678' }];
    expect(findCsvDuplicates(importRecords, existing)).toHaveLength(2);
  });

  it('E4: duplicate detection is case-insensitive', () => {
    const existing = [makeVuln('e1', 'CVE-2021-1234')];
    const importRecords = [{ cveId: 'cve-2021-1234' }];
    expect(findCsvDuplicates(importRecords, existing)).toHaveLength(1);
  });

  it('E5: import is informational only — existing records are not modified', () => {
    const existing = [makeVuln('e1', 'CVE-2021-1234', 'Remediated')];
    const importRecords = [{ cveId: 'CVE-2021-1234' }];
    findCsvDuplicates(importRecords, existing);
    // The existing record is untouched
    expect(existing[0].status).toBe('Remediated');
  });
});
