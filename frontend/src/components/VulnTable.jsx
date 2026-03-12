import { useState } from 'react';
import { getRiskTier } from '../utils/scoringEngine';
import { filterVulns, sortVulns } from '../utils/filterSort';
import { exportCSV, exportPDF, formatDate } from '../utils/exportUtils';

// ─── Column definitions ───────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'cveId',              label: 'CVE ID',          align: 'left'   },
  { key: 'title',              label: 'Title',           align: 'left'   },
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

// ─── Display sub-components (unchanged from Sprint 1/2) ───────────────────────

function ScoreBar({ score }) {
  const { tier } = getRiskTier(score);
  const colorMap = { Critical: 'bg-red-500', High: 'bg-orange-500', Medium: 'bg-yellow-400', Low: 'bg-green-500' };
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-gray-200">
        <div className={`h-2 rounded-full transition-all ${colorMap[tier]}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-semibold text-gray-800">{score}</span>
    </div>
  );
}

function TierBadge({ score }) {
  const { tier, badge } = getRiskTier(score);
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

// ─── Filter bar ───────────────────────────────────────────────────────────────

const fSelectClass = 'rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

function FilterBar({ filters, onChange, onClear, hasFilters, vulnerabilities }) {
  const groupOptions = [...new Set(vulnerabilities.map((v) => v.groupName).filter(Boolean))].sort();
  const userOptions  = [...new Set(vulnerabilities.map((v) => v.assignedToEmail).filter(Boolean))].sort();

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-6 py-3">
      {/* Text search */}
      <div className="relative">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400">
          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
        </svg>
        <input
          type="text"
          placeholder="Search CVE ID or title…"
          value={filters.search}
          onChange={(e) => onChange('search', e.target.value)}
          className="rounded-md border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[200px]"
        />
      </div>

      <select value={filters.riskTier} onChange={(e) => onChange('riskTier', e.target.value)} className={fSelectClass}>
        <option value="">All Tiers</option>
        <option value="Critical">Critical</option>
        <option value="High">High</option>
        <option value="Medium">Medium</option>
        <option value="Low">Low</option>
      </select>

      <select value={filters.assetCriticality} onChange={(e) => onChange('assetCriticality', e.target.value)} className={fSelectClass}>
        <option value="">All Criticality</option>
        <option value="Critical">Critical</option>
        <option value="High">High</option>
        <option value="Medium">Medium</option>
        <option value="Low">Low</option>
      </select>

      <select value={filters.internetFacing} onChange={(e) => onChange('internetFacing', e.target.value)} className={fSelectClass}>
        <option value="">All Exposure</option>
        <option value="yes">Internet Facing</option>
        <option value="no">Internal Only</option>
      </select>

      <select value={filters.groupName} onChange={(e) => onChange('groupName', e.target.value)} className={fSelectClass}>
        <option value="">All Groups</option>
        {groupOptions.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>

      <select value={filters.assignedTo} onChange={(e) => onChange('assignedTo', e.target.value)} className={fSelectClass}>
        <option value="">All Users</option>
        <option value="__unassigned__">Unassigned</option>
        {userOptions.map((email) => (
          <option key={email} value={email}>{email}</option>
        ))}
      </select>

      <select value={filters.kev} onChange={(e) => onChange('kev', e.target.value)} className={fSelectClass}>
        <option value="">All (KEV + Non-KEV)</option>
        <option value="kev_only">KEV Only</option>
        <option value="non_kev">Non-KEV</option>
      </select>

      {hasFilters && (
        <button type="button" onClick={onClear}
          className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-100 transition-colors">
          Clear filters
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const EMPTY_FILTERS = { search: '', riskTier: '', assetCriticality: '', internetFacing: '', groupName: '', assignedTo: '', kev: '' };

export default function VulnTable({ vulnerabilities, onDelete, onEdit, weights }) {
  const [filters, setFilters]   = useState(EMPTY_FILTERS);
  const [sortKey, setSortKey]   = useState('compositeScore');
  const [sortDir, setSortDir]   = useState('desc');

  const filtered   = filterVulns(vulnerabilities, filters);
  const sorted     = sortVulns(filtered, sortKey, sortDir);
  const hasFilters = Object.values(filters).some(Boolean);

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
  }

  // ── Empty state ────────────────────────────────────────────────────────────
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

      {/* ── Filter bar ── */}
      <FilterBar filters={filters} onChange={handleFilterChange} onClear={clearFilters} hasFilters={hasFilters} vulnerabilities={vulnerabilities} />

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
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

              {/* Delete — not sortable */}
              <th className="px-4 py-3" />
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="py-12 text-center text-sm text-gray-500">
                  No vulnerabilities match the current filters.{' '}
                  <button type="button" onClick={clearFilters}
                    className="font-medium text-blue-600 underline hover:text-blue-700">
                    Clear filters
                  </button>
                </td>
              </tr>
            ) : (
              sorted.map((vuln, index) => (
                <VulnRow key={vuln.id} vuln={vuln} rank={index + 1} onDelete={onDelete} onEdit={onEdit} />
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
        </p>
      </div>
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function VulnRow({ vuln, rank, onDelete, onEdit }) {
  const { bg, border } = getRiskTier(vuln.compositeScore ?? 0);

  return (
    <tr className={`${bg} border-l-4 ${border} transition-colors hover:brightness-95`}>
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
        <ScoreBar score={vuln.compositeScore ?? 0} />
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <TierBadge score={vuln.compositeScore ?? 0} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
        {formatDate(vuln.dateAdded)}
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
