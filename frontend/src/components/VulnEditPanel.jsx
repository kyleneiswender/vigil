import { useState, useEffect, useRef } from 'react';
import { fetchGroups, fetchUsers } from '../lib/api.js';
import { formatEpssScore, formatEpssPercentile } from '../utils/epssUtils.js';
import { formatDate } from '../utils/exportUtils.js';

const CVE_PATTERN = /^CVE-\d{4}-\d{4,}$/i;
const MAX_DAYS = 36500;
const MAX_ASSET_COUNT = 100_000;

const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const selectClass = inputClass;

/**
 * Slide-in side panel for editing an existing vulnerability record.
 * Validation rules mirror VulnForm.jsx exactly.
 *
 * @param {{ vuln: object, organizationId: string, onSave: (id: string, data: object) => Promise<void>, onCancel: () => void }} props
 */
export default function VulnEditPanel({ vuln, organizationId, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({
    cveId:              vuln.cveId ?? '',
    title:              vuln.title ?? '',
    cvssScore:          vuln.cvssScore ?? '',
    assetCriticality:   vuln.assetCriticality ?? 'Medium',
    internetFacing:     vuln.internetFacing ?? false,
    exploitability:     vuln.exploitability ?? 'Theoretical',
    daysSinceDiscovery: vuln.daysSinceDiscovery ?? '',
    affectedAssetCount: vuln.affectedAssetCount ?? '',
    group:              vuln.group         ?? '',
    assignedTo:         vuln.assignedTo    ?? '',
    epssScore:          vuln.epssScore     ?? null,
    epssPercentile:     vuln.epssPercentile ?? null,
  }));
  const [errors, setErrors]       = useState({});
  const [saving, setSaving]       = useState(false);
  const [groups, setGroups]       = useState([]);
  const [users,  setUsers]        = useState([]);
  const [optLoading, setOptLoading] = useState(true);
  const panelRef = useRef(null);

  // Close on Escape key
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Focus the panel on open for accessibility
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Fetch groups and users for the assignment dropdowns
  useEffect(() => {
    Promise.all([fetchGroups(organizationId), fetchUsers(organizationId)])
      .then(([gs, us]) => { setGroups(gs); setUsers(us); })
      .catch(() => {}) // non-blocking — dropdowns just stay empty on error
      .finally(() => setOptLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  }

  function validate() {
    const next = {};
    if (!form.cveId.toString().trim()) {
      next.cveId = 'CVE ID is required';
    } else if (!CVE_PATTERN.test(form.cveId.toString().trim())) {
      next.cveId = 'CVE ID must match format CVE-YYYY-NNNNN (e.g. CVE-2024-12345)';
    }
    if (!form.title.toString().trim()) next.title = 'Title is required';

    const cvss = Number(form.cvssScore);
    if (form.cvssScore === '' || isNaN(cvss)) {
      next.cvssScore = 'CVSS score is required';
    } else if (cvss < 0 || cvss > 10) {
      next.cvssScore = 'CVSS score must be between 0 and 10';
    }

    const days = Number(form.daysSinceDiscovery);
    if (form.daysSinceDiscovery === '' || isNaN(days)) {
      next.daysSinceDiscovery = 'Days since discovery is required';
    } else if (days < 0) {
      next.daysSinceDiscovery = 'Must be 0 or greater';
    } else if (days > MAX_DAYS) {
      next.daysSinceDiscovery = `Must be ${MAX_DAYS.toLocaleString()} days or less`;
    }

    const assets = Number(form.affectedAssetCount);
    if (form.affectedAssetCount === '' || isNaN(assets)) {
      next.affectedAssetCount = 'Affected asset count is required';
    } else if (assets < 0) {
      next.affectedAssetCount = 'Must be 0 or greater';
    } else if (assets > MAX_ASSET_COUNT) {
      next.affectedAssetCount = `Must be ${MAX_ASSET_COUNT.toLocaleString()} or less`;
    }

    return next;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSaving(true);
    try {
      await onSave(vuln.id, {
        ...form,
        cvssScore:          Number(form.cvssScore),
        daysSinceDiscovery: Number(form.daysSinceDiscovery),
        affectedAssetCount: Number(form.affectedAssetCount),
      });
    } finally {
      setSaving(false);
    }
  }

  const errCls = 'border-red-400 focus:border-red-500 focus:ring-red-500';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 transition-opacity"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label={`Edit ${vuln.cveId}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Edit Vulnerability</h2>
            <p className="mt-0.5 text-sm text-gray-500 font-mono">{vuln.cveId}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label="Close panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Scrollable form body */}
        <form onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* CVE ID */}
          <div>
            <label htmlFor="edit-cveId" className={labelClass}>
              CVE ID <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-cveId"
              name="cveId"
              type="text"
              value={form.cveId}
              onChange={handleChange}
              disabled={saving}
              className={`${inputClass} ${errors.cveId ? errCls : ''}`}
            />
            {errors.cveId && <p className="mt-1 text-xs text-red-600">{errors.cveId}</p>}
          </div>

          {/* Title */}
          <div>
            <label htmlFor="edit-title" className={labelClass}>
              Title / Description <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-title"
              name="title"
              type="text"
              value={form.title}
              onChange={handleChange}
              disabled={saving}
              className={`${inputClass} ${errors.title ? errCls : ''}`}
            />
            {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title}</p>}
          </div>

          {/* CVSS Score */}
          <div>
            <label htmlFor="edit-cvssScore" className={labelClass}>
              CVSS v3 Base Score (0–10) <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-cvssScore"
              name="cvssScore"
              type="number"
              min="0"
              max="10"
              step="0.1"
              value={form.cvssScore}
              onChange={handleChange}
              disabled={saving}
              className={`${inputClass} ${errors.cvssScore ? errCls : ''}`}
            />
            {errors.cvssScore && <p className="mt-1 text-xs text-red-600">{errors.cvssScore}</p>}
          </div>

          {/* EPSS Score + Percentile (read-only) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className={labelClass}>EPSS Score</p>
              <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {formatEpssScore(vuln.epssScore ?? null)}
              </p>
              <p className="mt-1 text-xs text-gray-400">Populated automatically via CVE lookup</p>
            </div>
            <div>
              <p className={labelClass}>EPSS Percentile</p>
              <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {formatEpssPercentile(vuln.epssPercentile ?? null)}
              </p>
              <p className="mt-1 text-xs text-gray-400">Populated automatically via CVE lookup</p>
            </div>
          </div>

          {/* Date Added (read-only) */}
          <div>
            <p className={labelClass}>Date Added</p>
            <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {formatDate(vuln.dateAdded)}
            </p>
            <p className="mt-1 text-xs text-gray-400">Set automatically when the record was created.</p>
          </div>

          {/* Asset Criticality */}
          <div>
            <label htmlFor="edit-assetCriticality" className={labelClass}>
              Asset Criticality
            </label>
            <select
              id="edit-assetCriticality"
              name="assetCriticality"
              value={form.assetCriticality}
              onChange={handleChange}
              disabled={saving}
              className={selectClass}
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>

          {/* Exploitability */}
          <div>
            <label htmlFor="edit-exploitability" className={labelClass}>
              Exploitability
            </label>
            <select
              id="edit-exploitability"
              name="exploitability"
              value={form.exploitability}
              onChange={handleChange}
              disabled={saving}
              className={selectClass}
            >
              <option value="Theoretical">Theoretical</option>
              <option value="PoC Exists">PoC Exists</option>
              <option value="Actively Exploited">Actively Exploited</option>
            </select>
          </div>

          {/* Days Since Discovery */}
          <div>
            <label htmlFor="edit-daysSinceDiscovery" className={labelClass}>
              Days Since Discovery <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-daysSinceDiscovery"
              name="daysSinceDiscovery"
              type="number"
              min="0"
              value={form.daysSinceDiscovery}
              onChange={handleChange}
              disabled={saving}
              className={`${inputClass} ${errors.daysSinceDiscovery ? errCls : ''}`}
            />
            {errors.daysSinceDiscovery && <p className="mt-1 text-xs text-red-600">{errors.daysSinceDiscovery}</p>}
          </div>

          {/* Affected Asset Count */}
          <div>
            <label htmlFor="edit-affectedAssetCount" className={labelClass}>
              Affected Asset Count <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-affectedAssetCount"
              name="affectedAssetCount"
              type="number"
              min="0"
              value={form.affectedAssetCount}
              onChange={handleChange}
              disabled={saving}
              className={`${inputClass} ${errors.affectedAssetCount ? errCls : ''}`}
            />
            {errors.affectedAssetCount && <p className="mt-1 text-xs text-red-600">{errors.affectedAssetCount}</p>}
          </div>

          {/* Internet Facing */}
          <div>
            <label className="flex cursor-pointer items-center gap-3">
              <div className="relative">
                <input
                  type="checkbox"
                  name="internetFacing"
                  checked={form.internetFacing}
                  onChange={handleChange}
                  disabled={saving}
                  className="sr-only"
                />
                <div
                  className={`h-6 w-11 rounded-full transition-colors ${
                    form.internetFacing ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                />
                <div
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    form.internetFacing ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">Internet Facing</span>
                <p className="text-xs text-gray-500">
                  {form.internetFacing ? 'Asset is publicly reachable' : 'Asset is internal only'}
                </p>
              </div>
            </label>
          </div>

          {/* Group */}
          <div>
            <label htmlFor="edit-group" className={labelClass}>
              Group
            </label>
            <select
              id="edit-group"
              name="group"
              value={form.group}
              onChange={handleChange}
              disabled={saving || optLoading}
              className={selectClass}
            >
              {optLoading ? (
                <option value="">Loading…</option>
              ) : groups.length === 0 ? (
                <>
                  <option value="">No group</option>
                  <option value="" disabled>No groups available — create groups in settings</option>
                </>
              ) : (
                <>
                  <option value="">No group</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </>
              )}
            </select>
          </div>

          {/* Assigned To */}
          <div>
            <label htmlFor="edit-assignedTo" className={labelClass}>
              Assigned To
            </label>
            <select
              id="edit-assignedTo"
              name="assignedTo"
              value={form.assignedTo}
              onChange={handleChange}
              disabled={saving || optLoading}
              className={selectClass}
            >
              <option value="">Unassigned</option>
              {!optLoading && users.map((u) => (
                <option key={u.id} value={u.id}>{u.email}</option>
              ))}
            </select>
          </div>
        </form>

        {/* Footer buttons — pinned to bottom */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form={undefined}
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  );
}
