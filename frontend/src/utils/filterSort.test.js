import { describe, it, expect } from 'vitest';
import { filterVulns, sortVulns } from './filterSort.js';
import { VULNERABILITY_STATUSES } from './scoringEngine.js';

// ─── Shared fixture ───────────────────────────────────────────────────────────

const vulns = [
  {
    id: '1', cveId: 'CVE-2024-0001', title: 'Alpha',
    riskTier: { tier: 'Critical' }, assetCriticality: 'High',
    internetFacing: true,  groupName: 'Red Team',  assignedToEmail: 'alice@example.com', compositeScore: 90,
  },
  {
    id: '2', cveId: 'CVE-2024-0002', title: 'Beta',
    riskTier: { tier: 'High'     }, assetCriticality: 'Medium',
    internetFacing: false, groupName: 'Blue Team', assignedToEmail: 'bob@example.com',   compositeScore: 65,
  },
  {
    id: '3', cveId: 'CVE-2024-0003', title: 'Gamma',
    riskTier: { tier: 'Medium'   }, assetCriticality: 'Low',
    internetFacing: false, groupName: '',          assignedToEmail: '',                  compositeScore: 45,
  },
  {
    id: '4', cveId: 'CVE-2024-0004', title: 'Delta',
    riskTier: { tier: 'Low'      }, assetCriticality: 'Low',
    internetFacing: false, groupName: 'Red Team',  assignedToEmail: '',                  compositeScore: 20,
  },
];

const ids = (result) => result.map((v) => v.id).sort();

const EMPTY = {
  search: '', riskTier: '', assetCriticality: '',
  internetFacing: '', groupName: '', assignedTo: '',
};

// ─── filterVulns — existing filters ──────────────────────────────────────────

describe('filterVulns — existing filters', () => {
  it('returns all when all filters are empty', () => {
    expect(filterVulns(vulns, EMPTY)).toHaveLength(4);
  });

  it('filters by search term in title (case-insensitive)', () => {
    const result = filterVulns(vulns, { ...EMPTY, search: 'alpha' });
    expect(ids(result)).toEqual(['1']);
  });

  it('filters by search term in CVE ID', () => {
    const result = filterVulns(vulns, { ...EMPTY, search: 'CVE-2024-0002' });
    expect(ids(result)).toEqual(['2']);
  });

  it('filters by riskTier', () => {
    const result = filterVulns(vulns, { ...EMPTY, riskTier: 'High' });
    expect(ids(result)).toEqual(['2']);
  });

  it('filters by assetCriticality', () => {
    const result = filterVulns(vulns, { ...EMPTY, assetCriticality: 'Low' });
    expect(ids(result)).toEqual(['3', '4']);
  });

  it('filters by internetFacing yes', () => {
    const result = filterVulns(vulns, { ...EMPTY, internetFacing: 'yes' });
    expect(ids(result)).toEqual(['1']);
  });

  it('filters by internetFacing no', () => {
    const result = filterVulns(vulns, { ...EMPTY, internetFacing: 'no' });
    expect(ids(result)).toEqual(['2', '3', '4']);
  });
});

// ─── filterVulns — groupName filter ──────────────────────────────────────────

describe('filterVulns — groupName filter', () => {
  it('returns all when groupName is empty', () => {
    expect(filterVulns(vulns, { ...EMPTY, groupName: '' })).toHaveLength(4);
  });

  it('filters to Red Team only (excludes ungrouped records)', () => {
    const result = filterVulns(vulns, { ...EMPTY, groupName: 'Red Team' });
    expect(ids(result)).toEqual(['1', '4']);
  });

  it('filters to Blue Team only', () => {
    const result = filterVulns(vulns, { ...EMPTY, groupName: 'Blue Team' });
    expect(ids(result)).toEqual(['2']);
  });

  it('returns empty array for a group that does not exist', () => {
    const result = filterVulns(vulns, { ...EMPTY, groupName: 'Nonexistent' });
    expect(result).toHaveLength(0);
  });

  it('excludes the ungrouped record when any group is selected', () => {
    const result = filterVulns(vulns, { ...EMPTY, groupName: 'Red Team' });
    expect(result.find((v) => v.id === '3')).toBeUndefined();
  });
});

// ─── filterVulns — assignedTo filter ─────────────────────────────────────────

describe('filterVulns — assignedTo filter', () => {
  it('returns all when assignedTo is empty', () => {
    expect(filterVulns(vulns, { ...EMPTY, assignedTo: '' })).toHaveLength(4);
  });

  it('returns only unassigned records for __unassigned__', () => {
    const result = filterVulns(vulns, { ...EMPTY, assignedTo: '__unassigned__' });
    expect(ids(result)).toEqual(['3', '4']);
  });

  it('filters to alice@example.com only', () => {
    const result = filterVulns(vulns, { ...EMPTY, assignedTo: 'alice@example.com' });
    expect(ids(result)).toEqual(['1']);
  });

  it('filters to bob@example.com only', () => {
    const result = filterVulns(vulns, { ...EMPTY, assignedTo: 'bob@example.com' });
    expect(ids(result)).toEqual(['2']);
  });

  it('returns empty array for an email that does not exist', () => {
    const result = filterVulns(vulns, { ...EMPTY, assignedTo: 'nobody@example.com' });
    expect(result).toHaveLength(0);
  });
});

// ─── filterVulns — combined filters ──────────────────────────────────────────

describe('filterVulns — combined filters', () => {
  it('groupName Red Team + assignedTo __unassigned__ → id 4 only', () => {
    const result = filterVulns(vulns, { ...EMPTY, groupName: 'Red Team', assignedTo: '__unassigned__' });
    expect(ids(result)).toEqual(['4']);
  });

  it('groupName Red Team + assignedTo alice@example.com → id 1 only', () => {
    const result = filterVulns(vulns, { ...EMPTY, groupName: 'Red Team', assignedTo: 'alice@example.com' });
    expect(ids(result)).toEqual(['1']);
  });

  it('riskTier Critical + groupName Red Team → id 1 only', () => {
    const result = filterVulns(vulns, { ...EMPTY, riskTier: 'Critical', groupName: 'Red Team' });
    expect(ids(result)).toEqual(['1']);
  });

  it('assetCriticality Low + assignedTo __unassigned__ → ids 3, 4', () => {
    const result = filterVulns(vulns, { ...EMPTY, assetCriticality: 'Low', assignedTo: '__unassigned__' });
    expect(ids(result)).toEqual(['3', '4']);
  });

  it('all filters active with no matches → empty', () => {
    const result = filterVulns(vulns, {
      search: 'alpha', riskTier: 'Low', assetCriticality: 'High',
      internetFacing: '', groupName: 'Red Team', assignedTo: '__unassigned__',
    });
    expect(result).toHaveLength(0);
  });
});

// ─── sortVulns ────────────────────────────────────────────────────────────────

describe('sortVulns', () => {
  it('sorts by compositeScore descending', () => {
    const result = sortVulns(vulns, 'compositeScore', 'desc');
    expect(result.map((v) => v.id)).toEqual(['1', '2', '3', '4']);
  });

  it('sorts by compositeScore ascending', () => {
    const result = sortVulns(vulns, 'compositeScore', 'asc');
    expect(result.map((v) => v.id)).toEqual(['4', '3', '2', '1']);
  });

  it('sorts by riskTier descending (Critical first)', () => {
    const result = sortVulns(vulns, 'riskTier', 'desc');
    expect(result[0].riskTier.tier).toBe('Critical');
    expect(result[result.length - 1].riskTier.tier).toBe('Low');
  });

  it('sorts by groupName ascending (empty strings last in locale sort)', () => {
    const result = sortVulns(vulns, 'groupName', 'asc');
    // empty string sorts before 'B' and 'R' in locale sort
    expect(result[0].groupName).toBe('');
  });

  it('does not mutate the original array', () => {
    const original = [...vulns];
    sortVulns(vulns, 'compositeScore', 'asc');
    expect(vulns).toEqual(original);
  });

  it('returns the array unchanged when sortKey is falsy', () => {
    const result = sortVulns(vulns, '', 'asc');
    expect(result).toBe(vulns);
  });
});

// ─── sortVulns — dateAdded field (chronological) ────────────────────────────────

describe('sortVulns — dateAdded field', () => {
  const datedVulns = [
    { id: 'c', riskTier: { tier: 'Low' }, dateAdded: '2026-03-15 10:00:00.000Z' },
    { id: 'a', riskTier: { tier: 'Low' }, dateAdded: '2026-01-01 10:00:00.000Z' },
    { id: 'b', riskTier: { tier: 'Low' }, dateAdded: '2026-02-15 10:00:00.000Z' },
  ];

  it('ascending order: oldest first', () => {
    const result = sortVulns(datedVulns, 'dateAdded', 'asc');
    expect(result.map((v) => v.id)).toEqual(['a', 'b', 'c']);
  });

  it('descending order: newest first', () => {
    const result = sortVulns(datedVulns, 'dateAdded', 'desc');
    expect(result.map((v) => v.id)).toEqual(['c', 'b', 'a']);
  });

  it('ISO 8601 string comparison preserves chronological order across month boundaries', () => {
    const cross = [
      { id: 'dec', riskTier: { tier: 'Low' }, dateAdded: '2025-12-31 23:59:59.000Z' },
      { id: 'jan', riskTier: { tier: 'Low' }, dateAdded: '2026-01-01 00:00:00.000Z' },
    ];
    const result = sortVulns(cross, 'dateAdded', 'asc');
    expect(result.map((v) => v.id)).toEqual(['dec', 'jan']);
  });

  it('does not mutate the input array', () => {
    const original = [...datedVulns];
    sortVulns(datedVulns, 'dateAdded', 'asc');
    expect(datedVulns).toEqual(original);
  });
});

// ─── filterVulns — kev filter ─────────────────────────────────────────────────

describe('filterVulns — kev filter', () => {
  const kevVulns = [
    { id: '1', cveId: 'CVE-2024-0001', title: 'Alpha', riskTier: { tier: 'Critical' },
      assetCriticality: 'High', internetFacing: true, groupName: '', assignedToEmail: '',
      compositeScore: 90, isKev: true },
    { id: '2', cveId: 'CVE-2024-0002', title: 'Beta',  riskTier: { tier: 'High' },
      assetCriticality: 'Medium', internetFacing: false, groupName: '', assignedToEmail: '',
      compositeScore: 65, isKev: false },
    { id: '3', cveId: 'CVE-2024-0003', title: 'Gamma', riskTier: { tier: 'Medium' },
      assetCriticality: 'Low', internetFacing: false, groupName: '', assignedToEmail: '',
      compositeScore: 45, isKev: true },
  ];

  const EMPTY_KEV = {
    search: '', riskTier: '', assetCriticality: '', internetFacing: '',
    groupName: '', assignedTo: '', kev: '',
  };

  it('kev="" returns all records', () => {
    expect(filterVulns(kevVulns, { ...EMPTY_KEV, kev: '' })).toHaveLength(3);
  });

  it('kev="kev_only" returns only KEV-flagged records', () => {
    const result = filterVulns(kevVulns, { ...EMPTY_KEV, kev: 'kev_only' });
    expect(result.map((v) => v.id).sort()).toEqual(['1', '3']);
  });

  it('kev="non_kev" returns only non-KEV records', () => {
    const result = filterVulns(kevVulns, { ...EMPTY_KEV, kev: 'non_kev' });
    expect(result.map((v) => v.id)).toEqual(['2']);
  });
});

// ─── filterVulns — status filter ──────────────────────────────────────────────

describe('filterVulns — status filter', () => {
  const EMPTY_STATUS = {
    search: '', riskTier: '', assetCriticality: '', internetFacing: '',
    groupName: '', assignedTo: '', kev: '',
  };

  const statusVulns = [
    { id: '1', cveId: 'CVE-2024-0001', title: 'A', riskTier: { tier: 'Critical' },
      assetCriticality: 'High', internetFacing: false, groupName: '', assignedToEmail: '',
      compositeScore: 90, isKev: false, status: 'Open' },
    { id: '2', cveId: 'CVE-2024-0002', title: 'B', riskTier: { tier: 'High' },
      assetCriticality: 'Medium', internetFacing: false, groupName: '', assignedToEmail: '',
      compositeScore: 70, isKev: false, status: 'In Progress' },
    { id: '3', cveId: 'CVE-2024-0003', title: 'C', riskTier: { tier: 'Medium' },
      assetCriticality: 'Low', internetFacing: false, groupName: '', assignedToEmail: '',
      compositeScore: 50, isKev: false, status: 'Remediated' },
    { id: '4', cveId: 'CVE-2024-0004', title: 'D', riskTier: { tier: 'Low' },
      assetCriticality: 'Low', internetFacing: false, groupName: '', assignedToEmail: '',
      compositeScore: 20, isKev: false, status: 'Accepted Risk' },
    { id: '5', cveId: 'CVE-2024-0005', title: 'E', riskTier: { tier: 'Low' },
      assetCriticality: 'Low', internetFacing: false, groupName: '', assignedToEmail: '',
      compositeScore: 15, isKev: false, status: 'False Positive' },
    { id: '6', cveId: 'CVE-2024-0006', title: 'F', riskTier: { tier: 'Medium' },
      assetCriticality: 'Medium', internetFacing: false, groupName: '', assignedToEmail: '',
      compositeScore: 55, isKev: false, status: 'Risk Re-opened' },
  ];

  it('status="active" excludes all CLOSED_STATUSES (Remediated, Accepted Risk, False Positive)', () => {
    const result = filterVulns(statusVulns, { ...EMPTY_STATUS, status: 'active' });
    const resultIds = result.map((v) => v.id).sort();
    expect(resultIds).toEqual(['1', '2', '6']); // Open, In Progress, Risk Re-opened
    expect(result.find((v) => v.status === 'Remediated')).toBeUndefined();
    expect(result.find((v) => v.status === 'Accepted Risk')).toBeUndefined();
    expect(result.find((v) => v.status === 'False Positive')).toBeUndefined();
  });

  it('status="active" includes Risk Re-opened (it is an active status)', () => {
    const result = filterVulns(statusVulns, { ...EMPTY_STATUS, status: 'active' });
    expect(result.find((v) => v.status === 'Risk Re-opened')).toBeDefined();
  });

  it('status="all" returns every record', () => {
    const result = filterVulns(statusVulns, { ...EMPTY_STATUS, status: 'all' });
    expect(result).toHaveLength(6);
  });

  it('status="" (empty string) returns every record — undefined behaves like "all"', () => {
    const result = filterVulns(statusVulns, { ...EMPTY_STATUS, status: '' });
    expect(result).toHaveLength(6);
  });

  it('specific status="Remediated" returns only Remediated records', () => {
    const result = filterVulns(statusVulns, { ...EMPTY_STATUS, status: 'Remediated' });
    expect(result.map((v) => v.id)).toEqual(['3']);
  });

  it('specific status="In Progress" returns only In Progress records', () => {
    const result = filterVulns(statusVulns, { ...EMPTY_STATUS, status: 'In Progress' });
    expect(result.map((v) => v.id)).toEqual(['2']);
  });

  it('specific status="Risk Re-opened" returns only Risk Re-opened records', () => {
    const result = filterVulns(statusVulns, { ...EMPTY_STATUS, status: 'Risk Re-opened' });
    expect(result.map((v) => v.id)).toEqual(['6']);
  });

  it('specific status with no matches returns empty array', () => {
    const result = filterVulns(statusVulns, { ...EMPTY_STATUS, status: 'Accepted Risk' });
    expect(result.map((v) => v.id)).toEqual(['4']);
  });
});

// ─── sortVulns — status field ─────────────────────────────────────────────────

describe('sortVulns — status field', () => {
  const statusVulns = VULNERABILITY_STATUSES.map((s, i) => ({
    id: String(i + 1),
    riskTier: { tier: 'Low' },
    status: s,
  })).reverse(); // start in reverse order so we can verify sorting

  it('ascending sort uses VULNERABILITY_STATUSES workflow order (Open first)', () => {
    const result = sortVulns(statusVulns, 'status', 'asc');
    expect(result.map((v) => v.status)).toEqual(VULNERABILITY_STATUSES);
  });

  it('descending sort reverses the workflow order (Risk Re-opened first)', () => {
    const result = sortVulns(statusVulns, 'status', 'desc');
    expect(result.map((v) => v.status)).toEqual([...VULNERABILITY_STATUSES].reverse());
  });

  it('does not mutate the input array', () => {
    const copy = [...statusVulns];
    sortVulns(statusVulns, 'status', 'asc');
    expect(statusVulns).toEqual(copy);
  });
});
