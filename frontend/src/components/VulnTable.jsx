import { useState, useEffect, useRef } from 'react';
import { getRiskTier, TIER_COLORS, VULNERABILITY_STATUSES, CLOSED_STATUSES } from '../utils/scoringEngine';
import { filterVulns, sortVulns } from '../utils/filterSort';
import { exportCSV, exportPDF, formatDate } from '../utils/exportUtils';

// ─── Column definitions ───────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'cveId',              label: 'CVE ID',          align: 'left'   },
  { key: 'title',              label: 'Title',           align: 'left'   },
  { key: 'status',             label: 'Status',          align: 'left'   },
  { key: 'cvssScore',          label: 'CVSS',            align: 'center' },
  { key: 'epssScore',          label: 'EPSS',            align: 'center' },
  { key: 'isKev',              label: 'KEV',             align: 'center' },
  { key: 'assetCriticality',   label: 'Criticality',     align: 'left'   },
  { key: 'exploitability',     label: 'Exploitability',  align: 'left'   },
  { key: 'internetFacing',     label: 'Internet',        align: 'center' },
  { key: 'daysSinceDiscovery', label: 'Age (days)',      align: 'center' },
  { key: 'affectedAssetCount', label: 'Assets',          align: 'center' },
  { key: 'compositeScore',     label: 'Composite Score', align: 'left'   },
  { key: 'riskTier',           label: 'Risk Tier',       align: 'left'   },
  { key: 'dateAdded',          label: 'Date Added',      align: 'left'   },
  { key: 'groupName',          label: 'Group',           align: 'left'   },
  { key: 'assignedToEmail',    label: 'Assigned To',     align: 'left'   },
];

// ─── Display sub-components ───────────────────────────────────────────────────

function ScoreBar({ score, riskThresholds = {} }) {
  const { tier } = getRiskTier(score, riskThresholds);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-gray-200">
        <div className={`h-2 rounded-full transition-all ${TIER_COLORS[tier].bar}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-semibold text-gray-800">{score}</span>
    </div>
  );
}

function TierBadge({ score, riskThresholds = {} }) {
  const { tier, badge } = getRiskTier(score, riskThresholds);
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge}`}>{tier}</span>;
}

function ExploitabilityBadge({ value }) {
  const styles = { Theoretical: 'bg-gray-100 text-gray-600', 'PoC Exists': 'bg-purple-100 text-purple-700', 'Actively Exploited': 'bg-red-100 text-red-700' };
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${styles[value] ?? 'bg-gray-100 text-gray-600'}`}>{value}</span>;
}

function CriticalityBadge({ value }) {
  const styles = { Low: 'bg-green-100 text-green-700', Medium: 'bg-yellow-100 text-yellow-700', High: 'bg-orange-100 text-orange-700', Critical: 'bg-red-100 text-red-700' };
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${styles[value] ?? 'bg-gray-100 text-gray-600'}`}>{value}</span>;
}

function CvssChip({ score }) {
  let cls = 'bg-gray-100 text-gray-700';
  if (score >= 9.0) cls = 'bg-red-600 text-white';
  else if (score >= 7.0) cls = 'bg-orange-500 text-white';
  else if (score >= 4.0) cls = 'bg-yellow-400 text-yellow-900';
  return <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-bold ${cls}`}>{score.toFixed(1)}</span>;
}

const STATUS_BADGE_STYLES = {
  'Open':           'bg-gray-100 text-gray-700',
  'In Progress':    'bg-blue-100 text-blue-700',
  'Remediated':     'bg-green-100 text-green-700',
  'Accepted Risk':  'bg-purple-100 text-purple-700',
  'False Positive': 'bg-slate-100 text-slate-700',
  'Risk Re-opened': 'bg-amber-100 text-amber-700',
};

function StatusBadge({ status }) {
  const cls = STATUS_BADGE_STYLES[status] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status ?? 'Open'}
    </span>
  );
}

function SummaryPills({ vulnerabilities }) {
  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  vulnerabilities.forEach((v) => { counts[v.riskTier.tier]++; });
  const pills = [
    { tier: 'Critical', cls: 'bg-red-600 text-white' },
    { tier: 'High',     cls: 'bg-orange-500 text-white' },
    { tier: 'Medium',   cls: 'bg-yellow-400 text-yellow-900' },
    { tier: 'Low',      cls: 'bg-green-500 text-white' },
  ];
  return (
    <div className="flex gap-2">
      {pills.map(({ tier, cls }) =>
        counts[tier] > 0 ? (
          <span key={tier} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
            {counts[tier]} {tier}
          </span>
        ) : null
      )}
    </div>
  );
}

// ─── Sort indicator ───────────────────────────────────────────────────────────

function SortIcon({ colKey, sortKey, sortDir }) {
  if (colKey !== sortKey) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-gray-300">
        <path d="M5 3.75a.75.75 0 0 0-1.5 0v8.5a.75.75 0 0 0 1.5 0v-8.5Zm7.5 0a.75.75 0 0 0-1.5 0v8.5a.75.75 0 0 0 1.5 0v-8.5Z" />
        <path d="m3.78 2.47-2.25 2.25a.75.75 0 0 0 1.06 1.06L4 5.31v7.44a.75.75 0 0 0 1.5 0V5.31l1.41 1.47a.75.75 0 0 0 1.08-1.04l-2.5-2.6a.75.75 0 0 0-1.08-.06Zm6.94 10.59.72-.75V5.81l1.41 1.47a.75.75 0 0 0 1.08-1.04l-2.5-2.6a.75.75 0 0 0-1.08-.06l-2.25 2.25a.75.75 0 1 0 1.06 1.06L10 5.44v7.62a.75.75 0 0 0 1.5 0v-.47l-.78.06Z" />
      </svg>
    );
  }
  return sortDir === 'asc' ? (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-blue-600">
      <path fillRule="evenodd" d="M8 14a.75.75 0 0 1-.75-.75V4.56L4.03 7.78a.75.75 0 0 1-1.06-1.06l4.5-4.5a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1-1.06 1.06L8.75 4.56v8.69A.75.75 0 0 1 8 14Z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-blue-600">
      <path fillRule="evenodd" d="M8 2a.75.75 0 0 1 .75.75v8.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.22 3.22V2.75A.75.75 0 0 1 8 2Z" clipRule="evenodd" />
    </svg>
  );
}

// ─── Filter popover + chips ───────────────────────────────────────────────────

const fSelectClass = 'w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const fLabelClass  = 'block text-xs font-medium text-gray-500 mb-1';

function chipLabel(key, value) {
  switch (key) {
    case 'search':          return `"${value}"`;
    case 'riskTier':        return `Tier: ${value}`;
    case 'assetCriticality':return `Criticality: ${value}`;
    case 'internetFacing':  return value === 'yes' ? 'Internet Facing' : 'Internal Only';
    case 'groupName':       return `Group: ${value}`;
    case 'assignedTo':      return value === '__unassigned__' ? 'Unassigned' : `User: ${value}`;
    case 'kev':             return value === 'kev_only' ? 'KEV Only' : 'Non-KEV';
    case 'status':          return value === 'all' ? 'All Statuses' : `Status: ${value}`;
    default:                return value;
  }
}

function FiltersBar({ filters, onChange, onClear, activeFilterCount, vulnerabilities }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const groupOptions = [...new Set(vulnerabilities.map((v) => v.groupName).filter(Boolean))].sort();
  const userOptions  = [...new Set(vulnerabilities.map((v) => v.assignedToEmail).filter(Boolean))].sort();

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const activeChips = Object.entries(filters).filter(([k, v]) =>
    k === 'status' ? v !== 'active' : Boolean(v)
  );

  return (
    <div className="border-b border-gray-200 bg-gray-50 px-6 py-2.5 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Filters button */}
        <div className="relative" ref={ref}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium shadow-sm transition-colors ${
              activeFilterCount > 0
                ? 'border-blue-400 bg-blue-600 text-white hover:bg-blue-700'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 0 1 .628.74v2.288a2.25 2.25 0 0 1-.659 1.59l-4.682 4.683a2.25 2.25 0 0 0-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 0 1 8 18.25v-5.757a2.25 2.25 0 0 0-.659-1.591L2.659 6.22A2.25 2.25 0 0 1 2 4.629V2.34a.75.75 0 0 1 .628-.74Z" clipRule="evenodd" />
            </svg>
            Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
          </button>

          {open && (
            <div className="absolute z-30 left-0 top-full mt-1 w-96 rounded-xl border border-gray-200 bg-white shadow-xl">
              <div className="px-4 pt-4 pb-3 space-y-3">
                {/* Search */}
                <div className="col-span-2">
                  <label className={fLabelClass}>Search</label>
                  <div className="relative">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                      className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400">
                      <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
                    </svg>
                    <input
                      type="text"
                      placeholder="CVE ID or title…"
                      value={filters.search}
                      onChange={(e) => onChange('search', e.target.value)}
                      className="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Grid of selects */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={fLabelClass}>Risk Tier</label>
                    <select value={filters.riskTier} onChange={(e) => onChange('riskTier', e.target.value)} className={fSelectClass}>
                      <option value="">All Tiers</option>
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                  <div>
                    <label className={fLabelClass}>Asset Criticality</label>
                    <select value={filters.assetCriticality} onChange={(e) => onChange('assetCriticality', e.target.value)} className={fSelectClass}>
                      <option value="">All</option>
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                  <div>
                    <label className={fLabelClass}>Internet Exposure</label>
                    <select value={filters.internetFacing} onChange={(e) => onChange('internetFacing', e.target.value)} className={fSelectClass}>
                      <option value="">All</option>
                      <option value="yes">Internet Facing</option>
                      <option value="no">Internal Only</option>
                    </select>
                  </div>
                  <div>
                    <label className={fLabelClass}>KEV</label>
                    <select value={filters.kev} onChange={(e) => onChange('kev', e.target.value)} className={fSelectClass}>
                      <option value="">All</option>
                      <option value="kev_only">KEV Only</option>
                      <option value="non_kev">Non-KEV</option>
                    </select>
                  </div>
                  <div>
                    <label className={fLabelClass}>Group</label>
                    <select value={filters.groupName} onChange={(e) => onChange('groupName', e.target.value)} className={fSelectClass}>
                      <option value="">All Groups</option>
                      {groupOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={fLabelClass}>Assigned To</label>
                    <select value={filters.assignedTo} onChange={(e) => onChange('assignedTo', e.target.value)} className={fSelectClass}>
                      <option value="">All Users</option>
                      <option value="__unassigned__">Unassigned</option>
                      {userOptions.map((email) => <option key={email} value={email}>{email}</option>)}
                    </select>
                  </div>
                </div>

                {/* Status spans full width */}
                <div>
                  <label className={fLabelClass}>Status</label>
                  <select value={filters.status} onChange={(e) => onChange('status', e.target.value)} className={fSelectClass}>
                    <option value="active">Active Only</option>
                    <option value="all">All Statuses</option>
                    {VULNERABILITY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Popover footer */}
              <div className="border-t border-gray-100 px-4 py-2.5 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => { onClear(); setOpen(false); }}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Active filter chips */}
        {activeChips.map(([key, value]) => (
          <span
            key={key}
            className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
          >
            {chipLabel(key, value)}
            <button
              type="button"
              onClick={() => onChange(key, key === 'status' ? 'active' : '')}
              className="ml-0.5 rounded-full text-blue-500 hover:text-blue-700 transition-colors"
              aria-label={`Remove ${key} filter`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
              </svg>
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const EMPTY_FILTERS = { search: '', riskTier: '', assetCriticality: '', internetFacing: '', groupName: '', assignedTo: '', kev: '', status: 'active' };

const popoverInputCls = 'w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const popoverBtnCls  = 'flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
const popoverCancelCls = 'rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors';

export default function VulnTable({
  vulnerabilities, onDelete, onEdit, weights, riskThresholds = {},
  selectedVulnIds = new Set(), onSelectionChange = () => {},
  onBulkStatusChange, onBulkAssignGroup, onBulkAssignUser, onBulkDelete,
  groups = [], orgUsers = [],
}) {
  const [filters, setFilters]   = useState(EMPTY_FILTERS);
  const [sortKey, setSortKey]   = useState('compositeScore');
  const [sortDir, setSortDir]   = useState('desc');
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  const [activePopover, setActivePopover] = useState(null);
  const [bulkStatus,  setBulkStatus]  = useState('Open');
  const [bulkComment, setBulkComment] = useState('');
  const [bulkGroupId, setBulkGroupId] = useState('');
  const [bulkUserId,  setBulkUserId]  = useState('');
  const [bulkApplying, setBulkApplying] = useState(false);

  const filtered          = filterVulns(vulnerabilities, filters);
  const sorted            = sortVulns(filtered, sortKey, sortDir);
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => k === 'status' ? v !== 'active' : Boolean(v)).length;
  const hasFilters        = activeFilterCount > 0;

  const allVisibleSelected  = sorted.length > 0 && sorted.every((v) => selectedVulnIds.has(v.id));
  const someVisibleSelected = !allVisibleSelected && sorted.some((v) => selectedVulnIds.has(v.id));

  // Reset lastSelectedIndex when selection is fully cleared
  useEffect(() => {
    if (selectedVulnIds.size === 0) setLastSelectedIndex(null);
  }, [selectedVulnIds.size]);

  function handleFilterChange(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() { setFilters(EMPTY_FILTERS); }

  function handleSort(key) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setLastSelectedIndex(null); // sorted order changed — range anchor is stale
  }

  function handleHeaderCheckbox() {
    const next = new Set(selectedVulnIds);
    if (allVisibleSelected) {
      sorted.forEach((v) => next.delete(v.id));
    } else {
      sorted.forEach((v) => next.add(v.id));
    }
    onSelectionChange(next);
    setLastSelectedIndex(null);
  }

  function handleRowCheckbox(vuln, index, shiftKey) {
    const next = new Set(selectedVulnIds);
    if (shiftKey && lastSelectedIndex !== null) {
      // Range select — add all rows between anchor and current index (inclusive)
      const lo = Math.min(lastSelectedIndex, index);
      const hi = Math.max(lastSelectedIndex, index);
      for (let i = lo; i <= hi; i++) {
        next.add(sorted[i].id);
      }
    } else {
      if (next.has(vuln.id)) {
        next.delete(vuln.id);
      } else {
        next.add(vuln.id);
      }
    }
    onSelectionChange(next);
    setLastSelectedIndex(index);
  }

  async function handleBulkApplyStatus() {
    setBulkApplying(true);
    try {
      await onBulkStatusChange([...selectedVulnIds], bulkStatus, bulkComment.trim() || null);
      setActivePopover(null);
      setBulkComment('');
    } finally {
      setBulkApplying(false);
    }
  }

  async function handleBulkApplyGroup() {
    setBulkApplying(true);
    try {
      await onBulkAssignGroup([...selectedVulnIds], bulkGroupId || null);
      setActivePopover(null);
      setBulkGroupId('');
    } finally {
      setBulkApplying(false);
    }
  }

  async function handleBulkApplyUser() {
    setBulkApplying(true);
    try {
      await onBulkAssignUser([...selectedVulnIds], bulkUserId || null);
      setActivePopover(null);
      setBulkUserId('');
    } finally {
      setBulkApplying(false);
    }
  }

  async function handleBulkApplyDelete() {
    setBulkApplying(true);
    try {
      await onBulkDelete([...selectedVulnIds]);
      setActivePopover(null);
    } finally {
      setBulkApplying(false);
    }
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (vulnerabilities.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Vulnerability Queue</h2>
          <p className="mt-0.5 text-sm text-gray-500">Sorted by composite risk score (highest first)</p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 text-4xl">🛡️</div>
          <p className="text-sm font-medium text-gray-500">No vulnerabilities added yet</p>
          <p className="mt-1 text-xs text-gray-400">Use the form above to add your first entry</p>
        </div>
      </div>
    );
  }

  const exportBtnClass = 'inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors';
  const activeColLabel = COLUMNS.find((c) => c.key === sortKey)?.label ?? sortKey;

  const isBulkStatusDisabled = bulkApplying || (bulkStatus === 'Accepted Risk' && !bulkComment.trim());
  const isStatusClosed = CLOSED_STATUSES.includes(bulkStatus);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* ── Card header ── */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Vulnerability Queue</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Showing{' '}
              <span className="font-medium text-gray-800">{sorted.length}</span>
              {' '}of{' '}
              <span className="font-medium text-gray-800">{vulnerabilities.length}</span>
              {' '}{vulnerabilities.length === 1 ? 'vulnerability' : 'vulnerabilities'}
              {hasFilters && sorted.length < vulnerabilities.length && (
                <span className="ml-1 text-blue-600">(filtered)</span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => exportCSV(sorted)} className={exportBtnClass}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
              </svg>
              Export CSV
            </button>

            <button type="button" onClick={() => exportPDF(sorted, weights)} className={exportBtnClass}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" clipRule="evenodd" />
              </svg>
              Export PDF
            </button>

            <SummaryPills vulnerabilities={vulnerabilities} />
          </div>
        </div>
      </div>

      {/* ── Bulk action toolbar ── */}
      {selectedVulnIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-blue-200 bg-blue-50 px-6 py-2.5">
          <span className="text-sm font-semibold text-blue-800">
            {selectedVulnIds.size} selected
          </span>

          {/* Change Status */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActivePopover(activePopover === 'status' ? null : 'status')}
              className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors"
            >
              Change Status
            </button>
            {activePopover === 'status' && (
              <div className="absolute z-20 left-0 top-full mt-1 w-72 rounded-lg border border-gray-200 bg-white shadow-lg">
                <div className="p-4 space-y-3">
                  <p className="text-sm font-semibold text-gray-800">Change Status</p>
                  <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className={popoverInputCls}>
                    {VULNERABILITY_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  {isStatusClosed && (
                    <>
                      <textarea
                        placeholder={bulkStatus === 'Accepted Risk' ? 'Justification (required)' : 'Comment (optional)'}
                        value={bulkComment}
                        onChange={(e) => setBulkComment(e.target.value)}
                        rows={2}
                        className={`${popoverInputCls} resize-none`}
                      />
                      {bulkStatus === 'Accepted Risk' && !bulkComment.trim() && (
                        <p className="text-xs text-red-600">Comment required for Accepted Risk</p>
                      )}
                    </>
                  )}
                  <div className="flex gap-2">
                    <button onClick={handleBulkApplyStatus} disabled={isBulkStatusDisabled} className={popoverBtnCls}>
                      {bulkApplying ? 'Applying…' : `Apply to ${selectedVulnIds.size}`}
                    </button>
                    <button onClick={() => setActivePopover(null)} className={popoverCancelCls}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Assign Group */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActivePopover(activePopover === 'group' ? null : 'group')}
              className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors"
            >
              Assign Group
            </button>
            {activePopover === 'group' && (
              <div className="absolute z-20 left-0 top-full mt-1 w-56 rounded-lg border border-gray-200 bg-white shadow-lg">
                <div className="p-4 space-y-3">
                  <p className="text-sm font-semibold text-gray-800">Assign Group</p>
                  <select value={bulkGroupId} onChange={(e) => setBulkGroupId(e.target.value)} className={popoverInputCls}>
                    <option value="">— Unassign —</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button onClick={handleBulkApplyGroup} disabled={bulkApplying} className={popoverBtnCls}>
                      {bulkApplying ? 'Applying…' : `Apply to ${selectedVulnIds.size}`}
                    </button>
                    <button onClick={() => setActivePopover(null)} className={popoverCancelCls}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Assign User */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActivePopover(activePopover === 'user' ? null : 'user')}
              className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors"
            >
              Assign User
            </button>
            {activePopover === 'user' && (
              <div className="absolute z-20 left-0 top-full mt-1 w-56 rounded-lg border border-gray-200 bg-white shadow-lg">
                <div className="p-4 space-y-3">
                  <p className="text-sm font-semibold text-gray-800">Assign User</p>
                  <select value={bulkUserId} onChange={(e) => setBulkUserId(e.target.value)} className={popoverInputCls}>
                    <option value="">— Unassign —</option>
                    {orgUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.email}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button onClick={handleBulkApplyUser} disabled={bulkApplying} className={popoverBtnCls}>
                      {bulkApplying ? 'Applying…' : `Apply to ${selectedVulnIds.size}`}
                    </button>
                    <button onClick={() => setActivePopover(null)} className={popoverCancelCls}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Delete */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActivePopover(activePopover === 'delete' ? null : 'delete')}
              className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              Delete
            </button>
            {activePopover === 'delete' && (
              <div className="absolute z-20 left-0 top-full mt-1 w-60 rounded-lg border border-red-200 bg-white shadow-lg">
                <div className="p-4 space-y-3">
                  <p className="text-sm font-semibold text-red-700">
                    Delete {selectedVulnIds.size} record{selectedVulnIds.size !== 1 ? 's' : ''}?
                  </p>
                  <p className="text-xs text-gray-600">This action cannot be undone.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleBulkApplyDelete}
                      disabled={bulkApplying}
                      className="flex-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {bulkApplying ? 'Deleting…' : 'Delete'}
                    </button>
                    <button onClick={() => setActivePopover(null)} className={popoverCancelCls}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => { onSelectionChange(new Set()); setActivePopover(null); }}
            className="ml-auto text-xs text-blue-600 hover:text-blue-800 underline"
          >
            Deselect all
          </button>
        </div>
      )}

      {/* ── Filters ── */}
      <FiltersBar filters={filters} onChange={handleFilterChange} onClear={clearFilters} activeFilterCount={activeFilterCount} vulnerabilities={vulnerabilities} />

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {/* Checkbox column */}
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(el) => { if (el) el.indeterminate = someVisibleSelected; }}
                  onChange={handleHeaderCheckbox}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                  aria-label="Select all visible"
                />
              </th>

              {/* Rank badge — not sortable */}
              <th className="w-10 px-4 py-3" />

              {COLUMNS.map((col) => (
                <th key={col.key}
                  className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide ${
                    col.align === 'center' ? 'text-center' : 'text-left'
                  } ${sortKey === col.key ? 'text-blue-600' : 'text-gray-500'}`}
                >
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className="inline-flex items-center gap-1 transition-colors hover:text-gray-800"
                  >
                    {col.label}
                    <SortIcon colKey={col.key} sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
              ))}

              {/* Actions — not sortable */}
              <th className="px-4 py-3" />
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 3} className="py-12 text-center text-sm text-gray-500">
                  No vulnerabilities match the current filters.{' '}
                  <button type="button" onClick={clearFilters}
                    className="font-medium text-blue-600 underline hover:text-blue-700">
                    Clear filters
                  </button>
                </td>
              </tr>
            ) : (
              sorted.map((vuln, index) => (
                <VulnRow
                  key={vuln.id}
                  vuln={vuln}
                  rank={index + 1}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  riskThresholds={riskThresholds}
                  isSelected={selectedVulnIds.has(vuln.id)}
                  onCheckbox={(shiftKey) => handleRowCheckbox(vuln, index, shiftKey)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer count ── */}
      <div className="border-t border-gray-100 px-6 py-2.5">
        <p className="text-xs text-gray-400">
          Showing <span className="font-medium text-gray-600">{sorted.length}</span> of{' '}
          <span className="font-medium text-gray-600">{vulnerabilities.length}</span> vulnerabilities
          {hasFilters && ' · filters active'}
          {' · '}sorted by <span className="font-medium text-gray-600">{activeColLabel}</span>{' '}
          ({sortDir === 'asc' ? '↑ asc' : '↓ desc'})
          {selectedVulnIds.size > 0 && (
            <span className="ml-2 font-medium text-blue-600">· {selectedVulnIds.size} selected</span>
          )}
        </p>
      </div>
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function VulnRow({ vuln, rank, onDelete, onEdit, riskThresholds = {}, isSelected = false, onCheckbox }) {
  const { bg, border } = getRiskTier(vuln.compositeScore ?? 0, riskThresholds);
  const isClosed = CLOSED_STATUSES.includes(vuln.status ?? 'Open');

  return (
    <tr className={`border-l-4 ${border} transition-colors hover:brightness-95${isClosed ? ' vuln-row--closed' : ''}${isSelected ? ' bg-blue-100' : ` ${bg}`}`}>
      <td className="whitespace-nowrap px-4 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {}}
          onClick={(e) => { e.stopPropagation(); onCheckbox(e.shiftKey); }}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
          aria-label={`Select ${vuln.cveId}`}
        />
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600">
          {rank}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <span className="font-mono text-xs font-semibold text-blue-700">{vuln.cveId}</span>
      </td>
      <td className="max-w-xs px-4 py-3">
        <span className="block truncate text-gray-900" title={vuln.title}>{vuln.title}</span>
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <StatusBadge status={vuln.status ?? 'Open'} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-center">
        <CvssChip score={vuln.cvssScore ?? 0} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-center text-gray-700 text-xs">
        {vuln.epssScore !== null && vuln.epssScore !== undefined
          ? `${(vuln.epssScore * 100).toFixed(1)}%`
          : '—'}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-center">
        {vuln.isKev ? (
          <span className="inline-flex rounded px-1.5 py-0.5 text-xs font-bold bg-red-700 text-white">KEV</span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <CriticalityBadge value={vuln.assetCriticality} />
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <ExploitabilityBadge value={vuln.exploitability} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-center">
        {vuln.internetFacing ? (
          <span title="Internet facing" className="text-red-600">●</span>
        ) : (
          <span title="Internal only" className="text-gray-300">●</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-center text-gray-700">
        {vuln.daysSinceDiscovery ?? 0}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-center text-gray-700">
        {(vuln.affectedAssetCount ?? 0).toLocaleString()}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <ScoreBar score={vuln.compositeScore ?? 0} riskThresholds={riskThresholds} />
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <TierBadge score={vuln.compositeScore ?? 0} riskThresholds={riskThresholds} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
        <span className="flex items-center gap-1.5">
          {formatDate(vuln.dateAdded)}
          {vuln.latestComment && (
            <span title={vuln.latestComment} className="cursor-help text-gray-400 hover:text-gray-600 transition-colors" aria-label="Has comment">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M1 8.74c0 .983.713 1.825 1.69 1.943.764.092 1.534.164 2.31.216v2.35a.75.75 0 0 0 1.28.53l2.51-2.51c.182-.181.427-.281.68-.281H13a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1H3a2 2 0 0 0-2 2v3.79Z" clipRule="evenodd" />
              </svg>
            </span>
          )}
        </span>
      </td>
      <td className="max-w-[120px] px-4 py-3">
        <span className="block truncate text-sm text-gray-500" title={vuln.groupName || undefined}>
          {vuln.groupName || '—'}
        </span>
      </td>
      <td className="max-w-[160px] px-4 py-3">
        <span className="block truncate text-sm text-gray-500" title={vuln.assignedToEmail || undefined}>
          {vuln.assignedToEmail || '—'}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => onEdit(vuln)}
            className="rounded p-1 text-gray-400 hover:bg-blue-100 hover:text-blue-600 transition-colors"
            title="Edit"
            aria-label={`Edit ${vuln.cveId}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(vuln.id)}
            className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600 transition-colors"
            title="Delete"
            aria-label={`Delete ${vuln.cveId}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}
