import { useState } from 'react';
import { lookupNvd } from '../lib/api.js';

const CVE_PATTERN = /^CVE-\d{4}-\d{4,}$/i;
const MAX_DAYS = 36500;
const MAX_ASSET_COUNT = 100_000;

const EMPTY_FORM = {
  cveId: '',
  title: '',
  cvssScore: '',
  assetCriticality: 'Medium',
  internetFacing: false,
  exploitability: 'Theoretical',
  daysSinceDiscovery: '',
  affectedAssetCount: '',
};

const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const selectClass = inputClass;
const errCls  = 'border-red-400 focus:border-red-500 focus:ring-red-500';
const fillCls = 'ring-1 ring-blue-300 bg-blue-50';

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ─── VulnForm ─────────────────────────────────────────────────────────────────

export default function VulnForm({ onAdd, nvdApiKey = '' }) {
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [errors,    setErrors]    = useState({});
  const [nvdStatus, setNvdStatus] = useState({ status: 'idle', message: '' });
  // status: 'idle' | 'loading' | 'error' | 'warn'
  const [nvdFilled, setNvdFilled] = useState(new Set());
  // field names auto-filled by NVD; cleared when the user edits the field

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
    if (nvdFilled.has(name)) {
      setNvdFilled((prev) => { const next = new Set(prev); next.delete(name); return next; });
    }
  }

  async function handleNvdLookup() {
    setNvdStatus({ status: 'loading', message: '' });
    const result = await lookupNvd(form.cveId.trim(), nvdApiKey || null);

    if (result.error === 'not_found') {
      setNvdStatus({ status: 'error', message: 'CVE not found in NVD. You can still enter details manually.' });
      return;
    }
    if (result.error === 'rate_limited') {
      setNvdStatus({ status: 'error', message: 'NVD rate limit reached. Wait 30 seconds or add an API key in Settings for a higher limit.' });
      return;
    }
    if (result.error === 'network_error') {
      setNvdStatus({ status: 'error', message: 'Could not reach NVD. Check your connection and try again.' });
      return;
    }
    if (result.error === 'malformed') {
      setNvdStatus({ status: 'error', message: 'Unexpected response from NVD. You can still enter details manually.' });
      return;
    }

    const updates = {};
    const filled  = new Set();
    if (result.description) { updates.title     = result.description;          filled.add('title'); }
    if (result.hasV3)       { updates.cvssScore = String(result.cvssV3Score); filled.add('cvssScore'); }

    setForm((prev) => ({ ...prev, ...updates }));
    setNvdFilled(filled);
    setNvdStatus(result.hasV2Only
      ? { status: 'warn', message: `NVD has no CVSS v3 score for this CVE. CVSS v2 score is ${result.cvssV2Score} — please enter v3 manually.` }
      : { status: 'idle', message: '' });
  }

  function validate() {
    const next = {};
    if (!form.cveId.trim()) {
      next.cveId = 'CVE ID is required';
    } else if (!CVE_PATTERN.test(form.cveId.trim())) {
      next.cveId = 'CVE ID must match format CVE-YYYY-NNNNN (e.g. CVE-2024-12345)';
    }
    if (!form.title.trim()) next.title = 'Title is required';

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

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    onAdd({
      ...form,
      cvssScore:          Number(form.cvssScore),
      daysSinceDiscovery: Number(form.daysSinceDiscovery),
      affectedAssetCount: Number(form.affectedAssetCount),
      id: crypto.randomUUID(),
    });

    setForm(EMPTY_FORM);
    setErrors({});
    setNvdStatus({ status: 'idle', message: '' });
    setNvdFilled(new Set());
  }

  const cveIsValid = CVE_PATTERN.test(form.cveId.trim());
  const lookupBusy = nvdStatus.status === 'loading';

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">Add Vulnerability</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Enter vulnerability details to calculate its composite risk score.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="px-6 py-5">
        {/* Row 1: CVE ID + Title */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* CVE ID with NVD lookup */}
          <div>
            <label htmlFor="cveId" className={labelClass}>
              CVE ID <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2 items-start">
              <input
                id="cveId"
                name="cveId"
                type="text"
                placeholder="CVE-2024-12345"
                value={form.cveId}
                onChange={handleChange}
                className={`flex-1 ${inputClass} ${errors.cveId ? errCls : ''}`}
              />
              <button
                type="button"
                onClick={handleNvdLookup}
                disabled={!cveIsValid || lookupBusy}
                title={cveIsValid ? 'Look up CVE in NVD' : 'Enter a valid CVE ID first'}
                aria-label="Look up CVE in NVD"
                className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-xs font-medium
                           text-gray-700 hover:bg-gray-50 transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed
                           flex items-center gap-1.5"
              >
                {lookupBusy ? <Spinner /> : 'Look up'}
              </button>
            </div>
            {errors.cveId && (
              <p className="mt-1 text-xs text-red-600">{errors.cveId}</p>
            )}
            {nvdStatus.message && (
              <p className={`mt-1 text-xs ${nvdStatus.status === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                {nvdStatus.message}
              </p>
            )}
          </div>

          {/* Title */}
          <div>
            <label htmlFor="title" className={labelClass}>
              Title / Description <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              name="title"
              type="text"
              placeholder="Remote code execution via buffer overflow"
              value={form.title}
              onChange={handleChange}
              className={`${inputClass} ${nvdFilled.has('title') ? fillCls : ''} ${errors.title ? errCls : ''}`}
            />
            {errors.title && (
              <p className="mt-1 text-xs text-red-600">{errors.title}</p>
            )}
          </div>
        </div>

        {/* Row 2: CVSS + Asset Criticality + Exploitability */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="cvssScore" className={labelClass}>
              CVSS v3 Base Score (0–10) <span className="text-red-500">*</span>
            </label>
            <input
              id="cvssScore"
              name="cvssScore"
              type="number"
              min="0"
              max="10"
              step="0.1"
              placeholder="7.5"
              value={form.cvssScore}
              onChange={handleChange}
              className={`${inputClass} ${nvdFilled.has('cvssScore') ? fillCls : ''} ${errors.cvssScore ? errCls : ''}`}
            />
            {errors.cvssScore && (
              <p className="mt-1 text-xs text-red-600">{errors.cvssScore}</p>
            )}
          </div>

          <div>
            <label htmlFor="assetCriticality" className={labelClass}>
              Asset Criticality
            </label>
            <select
              id="assetCriticality"
              name="assetCriticality"
              value={form.assetCriticality}
              onChange={handleChange}
              className={selectClass}
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>

          <div>
            <label htmlFor="exploitability" className={labelClass}>
              Exploitability
            </label>
            <select
              id="exploitability"
              name="exploitability"
              value={form.exploitability}
              onChange={handleChange}
              className={selectClass}
            >
              <option value="Theoretical">Theoretical</option>
              <option value="PoC Exists">PoC Exists</option>
              <option value="Actively Exploited">Actively Exploited</option>
            </select>
          </div>
        </div>

        {/* Row 3: Days Since Discovery + Affected Asset Count + Internet Facing */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="daysSinceDiscovery" className={labelClass}>
              Days Since Discovery <span className="text-red-500">*</span>
            </label>
            <input
              id="daysSinceDiscovery"
              name="daysSinceDiscovery"
              type="number"
              min="0"
              placeholder="30"
              value={form.daysSinceDiscovery}
              onChange={handleChange}
              className={`${inputClass} ${errors.daysSinceDiscovery ? errCls : ''}`}
            />
            {errors.daysSinceDiscovery && (
              <p className="mt-1 text-xs text-red-600">{errors.daysSinceDiscovery}</p>
            )}
          </div>

          <div>
            <label htmlFor="affectedAssetCount" className={labelClass}>
              Affected Asset Count <span className="text-red-500">*</span>
            </label>
            <input
              id="affectedAssetCount"
              name="affectedAssetCount"
              type="number"
              min="0"
              placeholder="50"
              value={form.affectedAssetCount}
              onChange={handleChange}
              className={`${inputClass} ${errors.affectedAssetCount ? errCls : ''}`}
            />
            {errors.affectedAssetCount && (
              <p className="mt-1 text-xs text-red-600">{errors.affectedAssetCount}</p>
            )}
          </div>

          <div className="flex items-end pb-0.5">
            <label className="flex cursor-pointer items-center gap-3">
              <div className="relative">
                <input
                  type="checkbox"
                  name="internetFacing"
                  checked={form.internetFacing}
                  onChange={handleChange}
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
        </div>

        {/* Submit */}
        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            Calculate &amp; Add
          </button>
        </div>
      </form>
    </div>
  );
}
