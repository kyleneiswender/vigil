import { describe, it, expect } from 'vitest';
import {
  normalizeCvss,
  normalizeAssetCriticality,
  normalizeInternetExposure,
  normalizeExploitability,
  normalizeDays,
  normalizeAffectedAssetCount,
  normalizeEpss,
  calculateCompositeScore,
  getRiskTier,
  scoreVulnerability,
  redistributeWeights,
  DEFAULT_WEIGHTS,
} from './scoringEngine.js';

// ─── normalizeCvss ────────────────────────────────────────────────────────────

describe('normalizeCvss', () => {
  it('maps 0 → 0', () => expect(normalizeCvss(0)).toBe(0));
  it('maps 10 → 100', () => expect(normalizeCvss(10)).toBe(100));
  it('maps 5 → 50', () => expect(normalizeCvss(5)).toBe(50));
  it('maps 7.5 → 75', () => expect(normalizeCvss(7.5)).toBe(75));
  it('clamps negative values to 0', () => expect(normalizeCvss(-1)).toBe(0));
  it('clamps values above 10 to 100', () => expect(normalizeCvss(11)).toBe(100));
  it('clamps large values to 100', () => expect(normalizeCvss(100)).toBe(100));
  it('handles NaN as 0', () => expect(normalizeCvss(NaN)).toBe(0));
  it('handles undefined as 0', () => expect(normalizeCvss(undefined)).toBe(0));
  it('handles null as 0', () => expect(normalizeCvss(null)).toBe(0));
  it('coerces numeric string', () => expect(normalizeCvss('7.5')).toBe(75));
  it('handles empty string as 0', () => expect(normalizeCvss('')).toBe(0));
});

// ─── normalizeAssetCriticality ────────────────────────────────────────────────

describe('normalizeAssetCriticality', () => {
  it('Low → 25', () => expect(normalizeAssetCriticality('Low')).toBe(25));
  it('Medium → 50', () => expect(normalizeAssetCriticality('Medium')).toBe(50));
  it('High → 75', () => expect(normalizeAssetCriticality('High')).toBe(75));
  it('Critical → 100', () => expect(normalizeAssetCriticality('Critical')).toBe(100));
  it('unknown string → 0', () => expect(normalizeAssetCriticality('Extreme')).toBe(0));
  it('empty string → 0', () => expect(normalizeAssetCriticality('')).toBe(0));
  it('undefined → 0', () => expect(normalizeAssetCriticality(undefined)).toBe(0));
  it('case-sensitive: lowercase low → 0', () => expect(normalizeAssetCriticality('low')).toBe(0));
});

// ─── normalizeInternetExposure ────────────────────────────────────────────────

describe('normalizeInternetExposure', () => {
  it('true → 100', () => expect(normalizeInternetExposure(true)).toBe(100));
  it('false → 0', () => expect(normalizeInternetExposure(false)).toBe(0));
  it('undefined → 0 (falsy)', () => expect(normalizeInternetExposure(undefined)).toBe(0));
  it('null → 0 (falsy)', () => expect(normalizeInternetExposure(null)).toBe(0));
  it('0 → 0 (falsy)', () => expect(normalizeInternetExposure(0)).toBe(0));
  it('truthy non-boolean → 100', () => expect(normalizeInternetExposure(1)).toBe(100));
});

// ─── normalizeExploitability ──────────────────────────────────────────────────

describe('normalizeExploitability', () => {
  it('Theoretical → 25', () => expect(normalizeExploitability('Theoretical')).toBe(25));
  it('PoC Exists → 60', () => expect(normalizeExploitability('PoC Exists')).toBe(60));
  it('Actively Exploited → 100', () => expect(normalizeExploitability('Actively Exploited')).toBe(100));
  it('unknown string → 0', () => expect(normalizeExploitability('Unknown')).toBe(0));
  it('empty string → 0', () => expect(normalizeExploitability('')).toBe(0));
  it('undefined → 0', () => expect(normalizeExploitability(undefined)).toBe(0));
  it('partial match not accepted (exact only)', () => expect(normalizeExploitability('PoC')).toBe(0));
});

// ─── normalizeDays ────────────────────────────────────────────────────────────

describe('normalizeDays', () => {
  it('0 → 0', () => expect(normalizeDays(0)).toBe(0));
  it('365 → 100 (ceiling day)', () => expect(normalizeDays(365)).toBe(100));
  it('182.5 → 50 (half-year)', () => expect(normalizeDays(182.5)).toBe(50));
  it('730 → 100 (capped at 365)', () => expect(normalizeDays(730)).toBe(100));
  it('99999 → 100 (very large value capped)', () => expect(normalizeDays(99999)).toBe(100));
  it('negative → 0 (clamped)', () => expect(normalizeDays(-10)).toBe(0));
  it('NaN → 0', () => expect(normalizeDays(NaN)).toBe(0));
  it('undefined → 0', () => expect(normalizeDays(undefined)).toBe(0));
  it('is monotonically non-decreasing before ceiling', () => {
    const days = [0, 30, 90, 180, 270, 365];
    const scores = days.map(normalizeDays);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });
});

// ─── normalizeAffectedAssetCount ──────────────────────────────────────────────

describe('normalizeAffectedAssetCount', () => {
  it('0 → 0', () => expect(normalizeAffectedAssetCount(0)).toBe(0));
  it('1 → > 0 (first asset has positive weight)', () => {
    expect(normalizeAffectedAssetCount(1)).toBeGreaterThan(0);
  });
  it('10 → ~34.7', () => expect(normalizeAffectedAssetCount(10)).toBeCloseTo(34.7, 0));
  it('100 → ~66.8', () => expect(normalizeAffectedAssetCount(100)).toBeCloseTo(66.8, 0));
  it('1000 → 100 (ceiling)', () => expect(normalizeAffectedAssetCount(1000)).toBeCloseTo(100, 1));
  it('1001 → 100 (beyond ceiling is capped)', () => expect(normalizeAffectedAssetCount(1001)).toBe(100));
  it('10000 → 100 (large value capped)', () => expect(normalizeAffectedAssetCount(10000)).toBe(100));
  it('negative → 0 (clamped)', () => expect(normalizeAffectedAssetCount(-5)).toBe(0));
  it('NaN → 0', () => expect(normalizeAffectedAssetCount(NaN)).toBe(0));
  it('undefined → 0', () => expect(normalizeAffectedAssetCount(undefined)).toBe(0));
  it('is monotonically non-decreasing (log scale)', () => {
    const counts = [0, 1, 5, 10, 50, 100, 500, 1000];
    const scores = counts.map(normalizeAffectedAssetCount);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });
  it('log scale: jump 1→10 is larger than jump 500→510', () => {
    const lowJump  = normalizeAffectedAssetCount(10)  - normalizeAffectedAssetCount(1);
    const highJump = normalizeAffectedAssetCount(510) - normalizeAffectedAssetCount(500);
    expect(lowJump).toBeGreaterThan(highJump);
  });
});

// ─── normalizeEpss ────────────────────────────────────────────────────────────

describe('normalizeEpss', () => {
  it('score 0 → 0',                () => expect(normalizeEpss(0)).toBe(0));
  it('score 1 → 100',              () => expect(normalizeEpss(1)).toBe(100));
  it('score 0.5 → 50',             () => expect(normalizeEpss(0.5)).toBe(50));
  it('null → 0 (no data fallback)', () => expect(normalizeEpss(null)).toBe(0));
  it('undefined → 0',              () => expect(normalizeEpss(undefined)).toBe(0));
  it('NaN → 0',                    () => expect(normalizeEpss(NaN)).toBe(0));
  it('negative value → 0 (clamped to 0)', () => expect(normalizeEpss(-0.5)).toBe(0));
  it('value above 1 → 100 (clamped to 1)', () => expect(normalizeEpss(1.5)).toBe(100));
});

// ─── getRiskTier ──────────────────────────────────────────────────────────────

describe('getRiskTier', () => {
  it('score 0 → Low', () => expect(getRiskTier(0).tier).toBe('Low'));
  it('score 39.9 → Low', () => expect(getRiskTier(39.9).tier).toBe('Low'));
  it('score 40 → Medium', () => expect(getRiskTier(40).tier).toBe('Medium'));
  it('score 59.9 → Medium', () => expect(getRiskTier(59.9).tier).toBe('Medium'));
  it('score 60 → High', () => expect(getRiskTier(60).tier).toBe('High'));
  it('score 79.9 → High', () => expect(getRiskTier(79.9).tier).toBe('High'));
  it('score 80 → Critical', () => expect(getRiskTier(80).tier).toBe('Critical'));
  it('score 100 → Critical', () => expect(getRiskTier(100).tier).toBe('Critical'));
  it('returns all required style properties', () => {
    const result = getRiskTier(80);
    expect(result).toHaveProperty('tier');
    expect(result).toHaveProperty('color');
    expect(result).toHaveProperty('bg');
    expect(result).toHaveProperty('border');
    expect(result).toHaveProperty('badge');
  });
  it('tier boundaries are exact (40 is Medium, not Low)', () => {
    expect(getRiskTier(39.9).tier).toBe('Low');
    expect(getRiskTier(40.0).tier).toBe('Medium');
    expect(getRiskTier(59.9).tier).toBe('Medium');
    expect(getRiskTier(60.0).tier).toBe('High');
    expect(getRiskTier(79.9).tier).toBe('High');
    expect(getRiskTier(80.0).tier).toBe('Critical');
  });
});

// ─── calculateCompositeScore ──────────────────────────────────────────────────

describe('calculateCompositeScore', () => {
  const baseVuln = {
    cvssScore: 7.5,
    assetCriticality: 'High',
    internetFacing: true,
    exploitability: 'PoC Exists',
    daysSinceDiscovery: 30,
    affectedAssetCount: 50,
  };

  it('returns a number in the range 0–100', () => {
    const score = calculateCompositeScore(baseVuln);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('uses DEFAULT_WEIGHTS when called without weights arg', () => {
    expect(calculateCompositeScore(baseVuln)).toBe(
      calculateCompositeScore(baseVuln, DEFAULT_WEIGHTS)
    );
  });

  it('all-max inputs → 100', () => {
    const allMax = {
      cvssScore: 10,
      assetCriticality: 'Critical',
      internetFacing: true,
      exploitability: 'Actively Exploited',
      daysSinceDiscovery: 365,
      affectedAssetCount: 1000,
      epssScore: 1,
    };
    expect(calculateCompositeScore(allMax)).toBe(100);
  });

  it('known input produces correct score (25.0)', () => {
    // criticality:    normalizeAssetCriticality('Medium')=50,   weight 25% → 12.5
    // cvss:           normalizeCvss(5.0)=50,                    weight 20% → 10.0
    // assetCount:     normalizeAffectedAssetCount(0)=0,         weight 15% →  0
    // exposure:       normalizeInternetExposure(false)=0,       weight 15% →  0
    // exploitability: normalizeExploitability('Theoretical')=25, weight 10% →  2.5
    // epss:           normalizeEpss(null)=0,                    weight 10% →  0
    // days:           normalizeDays(0)=0,                       weight  5% →  0
    // total = 25.0 → rounded 1dp = 25.0
    const score = calculateCompositeScore({
      cvssScore: 5.0,
      assetCriticality: 'Medium',
      internetFacing: false,
      exploitability: 'Theoretical',
      daysSinceDiscovery: 0,
      affectedAssetCount: 0,
      epssScore: null,
    });
    expect(score).toBe(25.0);
  });

  it('100% weight on CVSS yields normalizeCvss result', () => {
    const cvssOnlyWeights = {
      criticality: 0, assetCount: 0, cvss: 100, exposure: 0, exploitability: 0, epss: 0, days: 0,
    };
    expect(calculateCompositeScore({ ...baseVuln, cvssScore: 5 }, cvssOnlyWeights)).toBe(50);
    expect(calculateCompositeScore({ ...baseVuln, cvssScore: 10 }, cvssOnlyWeights)).toBe(100);
    expect(calculateCompositeScore({ ...baseVuln, cvssScore: 0 }, cvssOnlyWeights)).toBe(0);
  });

  it('higher asset criticality → higher score (all else equal)', () => {
    const critical = calculateCompositeScore({ ...baseVuln, assetCriticality: 'Critical' });
    const low      = calculateCompositeScore({ ...baseVuln, assetCriticality: 'Low' });
    expect(critical).toBeGreaterThan(low);
  });

  it('internet-facing → higher score than internal (all else equal)', () => {
    const exposed  = calculateCompositeScore({ ...baseVuln, internetFacing: true });
    const internal = calculateCompositeScore({ ...baseVuln, internetFacing: false });
    expect(exposed).toBeGreaterThan(internal);
  });

  it('actively exploited → higher score than theoretical (all else equal)', () => {
    const active      = calculateCompositeScore({ ...baseVuln, exploitability: 'Actively Exploited' });
    const theoretical = calculateCompositeScore({ ...baseVuln, exploitability: 'Theoretical' });
    expect(active).toBeGreaterThan(theoretical);
  });

  it('result is rounded to one decimal place', () => {
    const score = calculateCompositeScore(baseVuln);
    expect(score).toBe(Math.round(score * 10) / 10);
  });

  it('does not produce NaN for degenerate inputs', () => {
    const degenerate = {
      cvssScore: undefined,
      assetCriticality: 'NotAValue',
      internetFacing: null,
      exploitability: 'NotAValue',
      daysSinceDiscovery: undefined,
      affectedAssetCount: undefined,
    };
    const score = calculateCompositeScore(degenerate);
    expect(score).not.toBeNaN();
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

// ─── scoreVulnerability ───────────────────────────────────────────────────────

describe('scoreVulnerability', () => {
  const vuln = {
    id: 'abc-123',
    cveId: 'CVE-2024-1234',
    title: 'Test vulnerability',
    cvssScore: 7.5,
    assetCriticality: 'High',
    internetFacing: true,
    exploitability: 'PoC Exists',
    daysSinceDiscovery: 30,
    affectedAssetCount: 50,
  };

  it('returns an object with compositeScore property', () => {
    expect(scoreVulnerability(vuln)).toHaveProperty('compositeScore');
  });

  it('compositeScore is a number', () => {
    expect(typeof scoreVulnerability(vuln).compositeScore).toBe('number');
  });

  it('returns an object with riskTier property', () => {
    expect(scoreVulnerability(vuln)).toHaveProperty('riskTier');
  });

  it('riskTier has a tier string', () => {
    expect(typeof scoreVulnerability(vuln).riskTier.tier).toBe('string');
  });

  it('does not mutate the input object', () => {
    const before = JSON.stringify(vuln);
    scoreVulnerability(vuln);
    expect(JSON.stringify(vuln)).toBe(before);
  });

  it('preserves all original fields on the returned object', () => {
    const result = scoreVulnerability(vuln);
    expect(result.id).toBe(vuln.id);
    expect(result.cveId).toBe(vuln.cveId);
    expect(result.title).toBe(vuln.title);
    expect(result.cvssScore).toBe(vuln.cvssScore);
  });

  it('compositeScore matches calculateCompositeScore', () => {
    const result = scoreVulnerability(vuln);
    const { compositeScore, riskTier, ...rest } = result;
    expect(compositeScore).toBe(calculateCompositeScore(rest));
  });

  it('accepts custom weights and re-scores accordingly', () => {
    const highCvssWeights = { criticality: 0, assetCount: 0, cvss: 100, exposure: 0, exploitability: 0, epss: 0, days: 0 };
    const result = scoreVulnerability(vuln, highCvssWeights);
    expect(result.compositeScore).toBe(75); // normalizeCvss(7.5)=75
  });

  it('passes through epssScore when present', () => {
    const result = scoreVulnerability({ ...vuln, epssScore: 0.9432 });
    expect(result.epssScore).toBe(0.9432);
  });

  it('passes through epssPercentile when present', () => {
    const result = scoreVulnerability({ ...vuln, epssPercentile: 0.9712 });
    expect(result.epssPercentile).toBe(0.9712);
  });

  it('returns null for epssScore when field is absent', () => {
    const result = scoreVulnerability(vuln);
    expect(result.epssScore).toBeNull();
  });

  it('returns null for epssPercentile when field is absent', () => {
    const result = scoreVulnerability(vuln);
    expect(result.epssPercentile).toBeNull();
  });
});

// ─── redistributeWeights ─────────────────────────────────────────────────────

describe('redistributeWeights', () => {
  it('result always sums to 100', () => {
    const result = redistributeWeights(DEFAULT_WEIGHTS, 'cvss', 40);
    const sum = Object.values(result).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  it('sets the changed key to the new value', () => {
    const result = redistributeWeights(DEFAULT_WEIGHTS, 'cvss', 40);
    expect(result.cvss).toBe(40);
  });

  it('all values are non-negative integers', () => {
    const result = redistributeWeights(DEFAULT_WEIGHTS, 'criticality', 50);
    Object.values(result).forEach((v) => {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    });
  });

  it('clamps changed key minimum to 0', () => {
    const result = redistributeWeights(DEFAULT_WEIGHTS, 'cvss', -10);
    expect(result.cvss).toBe(0);
    expect(Object.values(result).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('clamps changed key maximum to 100 and zeroes others', () => {
    const result = redistributeWeights(DEFAULT_WEIGHTS, 'cvss', 150);
    expect(result.cvss).toBe(100);
    expect(Object.values(result).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('setting a key to 100 forces all others to 0', () => {
    const result = redistributeWeights(DEFAULT_WEIGHTS, 'criticality', 100);
    expect(result.criticality).toBe(100);
    const others = Object.entries(result).filter(([k]) => k !== 'criticality');
    expect(others.every(([, v]) => v === 0)).toBe(true);
  });

  it('handles edge case where all other weights are already 0', () => {
    const zeroOthers = { criticality: 0, assetCount: 0, cvss: 100, exposure: 0, exploitability: 0, days: 0 };
    const result = redistributeWeights(zeroOthers, 'cvss', 50);
    expect(result.cvss).toBe(50);
    expect(Object.values(result).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('sum invariant holds after three successive moves', () => {
    let w = { ...DEFAULT_WEIGHTS };
    w = redistributeWeights(w, 'cvss', 30);
    w = redistributeWeights(w, 'criticality', 40);
    w = redistributeWeights(w, 'days', 10);
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('does not mutate the input weights object', () => {
    const original = { ...DEFAULT_WEIGHTS };
    redistributeWeights(DEFAULT_WEIGHTS, 'cvss', 40);
    expect(DEFAULT_WEIGHTS).toEqual(original);
  });

  it('fractional new value is rounded to integer', () => {
    const result = redistributeWeights(DEFAULT_WEIGHTS, 'cvss', 33.7);
    expect(Number.isInteger(result.cvss)).toBe(true);
    expect(result.cvss).toBe(34); // Math.round(33.7)
  });
});

// ─── DEFAULT_WEIGHTS integrity ────────────────────────────────────────────────

describe('DEFAULT_WEIGHTS', () => {
  it('sums to exactly 100', () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  it('includes the epss key', () => {
    expect(DEFAULT_WEIGHTS).toHaveProperty('epss');
  });
});

// ─── calculateCompositeScore with EPSS ───────────────────────────────────────

describe('calculateCompositeScore — EPSS integration', () => {
  const baseVulnNoEpss = {
    cvssScore: 5.0,
    assetCriticality: 'Medium',
    internetFacing: false,
    exploitability: 'Theoretical',
    daysSinceDiscovery: 0,
    affectedAssetCount: 0,
  };

  it('EPSS score of 0.5 contributes 5 points at 10% weight (total 30.0)', () => {
    // criticality: 50*0.25=12.5, cvss: 50*0.20=10, exploitability: 25*0.10=2.5
    // epss: normalizeEpss(0.5)=50, 50*0.10=5.0 → total = 30.0
    const score = calculateCompositeScore({ ...baseVulnNoEpss, epssScore: 0.5 });
    expect(score).toBe(30.0);
  });

  it('null epssScore → EPSS contributes 0; score matches known input (25.0)', () => {
    // normalizeEpss(null)=0 — no penalty for missing EPSS data
    const score = calculateCompositeScore({ ...baseVulnNoEpss, epssScore: null });
    expect(score).toBe(25.0);
  });

  it('undefined epssScore → EPSS contributes 0 (same as null)', () => {
    const scoreNull      = calculateCompositeScore({ ...baseVulnNoEpss, epssScore: null });
    const scoreUndefined = calculateCompositeScore({ ...baseVulnNoEpss });
    expect(scoreUndefined).toBe(scoreNull);
  });

  it('weights not summing to 100 produce a finite non-NaN score', () => {
    const unbalanced = { criticality: 0, assetCount: 0, cvss: 50, exposure: 0, exploitability: 0, epss: 0, days: 0 };
    const score = calculateCompositeScore({ ...baseVulnNoEpss, cvssScore: 10 }, unbalanced);
    expect(score).not.toBeNaN();
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBe(50); // 100 * (50/100) = 50
  });
});

// ─── calculateCompositeScore — KEV override ───────────────────────────────────

describe('calculateCompositeScore — KEV exploitability override', () => {
  // Use 100% weight on exploitability so the override effect is unambiguous.
  const exploitOnlyWeights = { criticality: 0, assetCount: 0, cvss: 0, exposure: 0, exploitability: 100, epss: 0, days: 0 };

  const lowExploitVuln = {
    cvssScore: 5.0, assetCriticality: 'Medium', internetFacing: false,
    exploitability: 'Theoretical', daysSinceDiscovery: 0, affectedAssetCount: 0, epssScore: null,
  };

  it('isKev=true with Theoretical exploitability scores same as Actively Exploited', () => {
    const kevScore      = calculateCompositeScore({ ...lowExploitVuln, isKev: true  }, exploitOnlyWeights);
    const activeScore   = calculateCompositeScore({ ...lowExploitVuln, exploitability: 'Actively Exploited' }, exploitOnlyWeights);
    expect(kevScore).toBe(activeScore); // both → normalizeExploitability('Actively Exploited')=100
  });

  it('isKev=true with PoC Exists exploitability also scores as Actively Exploited', () => {
    const kevScore    = calculateCompositeScore({ ...lowExploitVuln, isKev: true, exploitability: 'PoC Exists' }, exploitOnlyWeights);
    const activeScore = calculateCompositeScore({ ...lowExploitVuln, exploitability: 'Actively Exploited' }, exploitOnlyWeights);
    expect(kevScore).toBe(activeScore);
  });

  it('isKev=false uses the dropdown exploitability value normally (Theoretical → 25%)', () => {
    const score = calculateCompositeScore({ ...lowExploitVuln, isKev: false }, exploitOnlyWeights);
    // normalizeExploitability('Theoretical')=25, weight 100% → 25
    expect(score).toBe(25);
  });

  it('isKev=undefined (absent) behaves the same as isKev=false', () => {
    const noKev  = calculateCompositeScore({ ...lowExploitVuln }, exploitOnlyWeights);
    const falseKev = calculateCompositeScore({ ...lowExploitVuln, isKev: false }, exploitOnlyWeights);
    expect(noKev).toBe(falseKev);
  });
});
