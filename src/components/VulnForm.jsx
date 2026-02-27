import { useState } from 'react';

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

export default function VulnForm({ onAdd }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

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
    if (!form.cveId.trim()) next.cveId = 'CVE ID is required';
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
    }

    const assets = Number(form.affectedAssetCount);
    if (form.affectedAssetCount === '' || isNaN(assets)) {
      next.affectedAssetCount = 'Affected asset count is required';
    } else if (assets < 0) {
      next.affectedAssetCount = 'Must be 0 or greater';
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
      cvssScore: Number(form.cvssScore),
      daysSinceDiscovery: Number(form.daysSinceDiscovery),
      affectedAssetCount: Number(form.affectedAssetCount),
      id: crypto.randomUUID(),
    });

    setForm(EMPTY_FORM);
    setErrors({});
  }

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
          <div>
            <label htmlFor="cveId" className={labelClass}>
              CVE ID <span className="text-red-500">*</span>
            </label>
            <input
              id="cveId"
              name="cveId"
              type="text"
              placeholder="CVE-2024-12345"
              value={form.cveId}
              onChange={handleChange}
              className={`${inputClass} ${errors.cveId ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`}
            />
            {errors.cveId && (
              <p className="mt-1 text-xs text-red-600">{errors.cveId}</p>
            )}
          </div>

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
              className={`${inputClass} ${errors.title ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`}
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
              className={`${inputClass} ${errors.cvssScore ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`}
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
              className={`${inputClass} ${errors.daysSinceDiscovery ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`}
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
              className={`${inputClass} ${errors.affectedAssetCount ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`}
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
