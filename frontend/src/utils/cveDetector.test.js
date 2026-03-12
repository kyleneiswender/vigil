// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractCveIds, injectCveActions } from './cveDetector.js';

// ── extractCveIds ─────────────────────────────────────────────────────────────

describe('extractCveIds', () => {
  it('T1: extracts a single CVE ID', () => {
    expect(extractCveIds('Patch for CVE-2021-44228 released')).toEqual(['CVE-2021-44228']);
  });

  it('T2: extracts multiple unique CVE IDs in order of appearance', () => {
    expect(extractCveIds('CVE-2021-44228 and CVE-2021-44229')).toEqual([
      'CVE-2021-44228',
      'CVE-2021-44229',
    ]);
  });

  it('T3: deduplicates repeated CVE IDs', () => {
    const result = extractCveIds('CVE-2021-44228 is mentioned again as CVE-2021-44228');
    expect(result).toEqual(['CVE-2021-44228']);
  });

  it('T4: normalizes IDs to uppercase regardless of input case', () => {
    expect(extractCveIds('cve-2021-44228')).toEqual(['CVE-2021-44228']);
  });

  it('T5: returns [] for text with no CVE IDs', () => {
    expect(extractCveIds('No vulnerabilities mentioned here')).toEqual([]);
  });

  it('T6: returns [] for null, undefined, and empty string', () => {
    expect(extractCveIds(null)).toEqual([]);
    expect(extractCveIds(undefined)).toEqual([]);
    expect(extractCveIds('')).toEqual([]);
  });

  it('T7: extracts CVE embedded inside HTML markup (via text content)', () => {
    const html = '<p>The vulnerability <strong>CVE-2023-12345</strong> is critical.</p>';
    expect(extractCveIds(html)).toContain('CVE-2023-12345');
  });
});

// ── injectCveActions ──────────────────────────────────────────────────────────

describe('injectCveActions', () => {
  it('T8: wraps an untracked CVE with a clickable "Track" badge', () => {
    const html   = '<p>CVE-2021-44228 is critical.</p>';
    const result = injectCveActions(html, []);
    expect(result).toContain('data-cve-id="CVE-2021-44228"');
    expect(result).toContain('Track');
  });

  it('T9: already-tracked CVE shows "Tracked" text and is disabled', () => {
    const html   = '<p>CVE-2021-44228 is critical.</p>';
    const result = injectCveActions(html, ['CVE-2021-44228']);
    expect(result).toContain('Tracked');
    expect(result).toContain('disabled');
    expect(result).toContain('cve-badge--tracked');
  });

  it('T10: untracked CVE has "cve-badge" class but not "cve-badge--tracked"', () => {
    const html   = '<p>CVE-2024-99999 vulnerability.</p>';
    const result = injectCveActions(html, ['CVE-2021-44228']);
    expect(result).toContain('data-cve-id="CVE-2024-99999"');
    expect(result).not.toContain('cve-badge--tracked');
    expect(result).not.toContain('disabled');
  });

  it('T11: CVE in an HTML attribute value is NOT wrapped (only text nodes are processed)', () => {
    const html   = '<a href="/issues/CVE-2021-44228">See details</a>';
    const result = injectCveActions(html, []);
    // href attribute must be preserved exactly
    expect(result).toContain('href="/issues/CVE-2021-44228"');
    // The link text "See details" has no CVE, so no badge should appear in it
    expect(result).not.toContain('data-cve-id="CVE-2021-44228"');
  });

  it('T12: empty string is returned as-is; null is returned as-is', () => {
    expect(injectCveActions('', [])).toBe('');
    expect(injectCveActions(null, [])).toBe(null);
  });

  it('T13: multiple CVEs in the same text node all get badges', () => {
    const html   = '<p>CVE-2021-44228 and CVE-2022-22965 are related.</p>';
    const result = injectCveActions(html, []);
    expect(result).toContain('data-cve-id="CVE-2021-44228"');
    expect(result).toContain('data-cve-id="CVE-2022-22965"');
  });
});
