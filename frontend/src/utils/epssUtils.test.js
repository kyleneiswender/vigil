import { describe, it, expect } from 'vitest';
import { formatEpssScore, formatEpssPercentile } from './epssUtils.js';

// ─── Suite K — formatEpssScore ────────────────────────────────────────────────

describe('formatEpssScore', () => {
  it('K1: typical score → two-decimal percentage string', () => {
    expect(formatEpssScore(0.9432)).toBe('94.32%');
  });

  it('K2: score of 0 → "0.00%"', () => {
    expect(formatEpssScore(0)).toBe('0.00%');
  });

  it('K3: score of 1 → "100.00%"', () => {
    expect(formatEpssScore(1)).toBe('100.00%');
  });

  it('K4: null → "Not available"', () => {
    expect(formatEpssScore(null)).toBe('Not available');
  });

  it('K5: undefined → "Not available"', () => {
    expect(formatEpssScore(undefined)).toBe('Not available');
  });
});

// ─── Suite K — formatEpssPercentile ──────────────────────────────────────────

describe('formatEpssPercentile', () => {
  it('K6: percentile 0.9712 → "Top 2.9%"', () => {
    // (1 - 0.9712) * 100 = 2.88 → toFixed(1) = '2.9'
    expect(formatEpssPercentile(0.9712)).toBe('Top 2.9%');
  });

  it('K7: percentile 0 → "Top 100.0%"', () => {
    expect(formatEpssPercentile(0)).toBe('Top 100.0%');
  });

  it('K8: percentile 1 → "Top 0.0%"', () => {
    expect(formatEpssPercentile(1)).toBe('Top 0.0%');
  });

  it('K9: null → "Not available"', () => {
    expect(formatEpssPercentile(null)).toBe('Not available');
  });

  it('K10: undefined → "Not available"', () => {
    expect(formatEpssPercentile(undefined)).toBe('Not available');
  });
});

// ─── Suite N — exploitability suggestion threshold ────────────────────────────
//
// The suggestion renders when:
//   epssScore !== null && epssScore >= 0.70 && exploitability !== 'Actively Exploited'
//
// These tests verify the threshold logic as a pure boolean expression.

describe('exploitability suggestion threshold', () => {
  const shouldSuggest = (epssScore, exploitability) =>
    epssScore !== null && epssScore !== undefined && epssScore >= 0.70 && exploitability !== 'Actively Exploited';

  it('N1: appears at exactly 0.70', () => {
    expect(shouldSuggest(0.70, 'Theoretical')).toBe(true);
  });

  it('N2: appears above 0.70', () => {
    expect(shouldSuggest(0.95, 'PoC Exists')).toBe(true);
  });

  it('N3: does not appear below 0.70', () => {
    expect(shouldSuggest(0.69, 'Theoretical')).toBe(false);
  });

  it('N4: does not appear when exploitability is Actively Exploited', () => {
    expect(shouldSuggest(0.95, 'Actively Exploited')).toBe(false);
  });

  it('N5: does not appear when epssScore is null', () => {
    expect(shouldSuggest(null, 'Theoretical')).toBe(false);
  });
});
