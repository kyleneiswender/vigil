import { useState, useEffect } from 'react';
import { fetchOrgSettings, updateOrgSettings, validateThresholds, validateDefaultWeights } from '../lib/api.js';
import { DEFAULT_WEIGHTS, WEIGHT_LABELS, redistributeWeights } from '../utils/scoringEngine.js';
import { formatDate } from '../utils/exportUtils.js';

const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm ' +
  'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

// ─── Section layout helper (extensible for future setting groups) ─────────────

function SettingsSection({ title, description, children }) {
  return (
    <div className="rounded-lg border border-gray-200 p-6 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Eye icons ────────────────────────────────────────────────────────────────

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
    </svg>
  );
}

function EyeSlashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
      <path d="m10.748 13.93 2.523 2.523a10.003 10.003 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  );
}

// ─── Tier band visualizer ─────────────────────────────────────────────────────

function TierBandVisualizer({ critical, high, medium }) {
  const c = Number(critical) || 80;
  const h = Number(high)     || 60;
  const m = Number(medium)   || 40;

  // Widths as percentages of 0–100 range
  const lowW    = m;
  const medW    = h - m;
  const highW   = c - h;
  const critW   = 100 - c;

  const valid = c > h && h > m && m >= 1 && c <= 99;

  return (
    <div className="space-y-1">
      <div className="flex rounded-md overflow-hidden h-6 text-[10px] font-semibold">
        {valid ? (
          <>
            <div className="bg-green-500 text-white flex items-center justify-center" style={{ width: `${lowW}%` }}>
              {lowW >= 8 ? 'Low' : ''}
            </div>
            <div className="bg-yellow-400 text-yellow-900 flex items-center justify-center" style={{ width: `${medW}%` }}>
              {medW >= 8 ? 'Med' : ''}
            </div>
            <div className="bg-orange-500 text-white flex items-center justify-center" style={{ width: `${highW}%` }}>
              {highW >= 8 ? 'High' : ''}
            </div>
            <div className="bg-red-600 text-white flex items-center justify-center" style={{ width: `${critW}%` }}>
              {critW >= 8 ? 'Crit' : ''}
            </div>
          </>
        ) : (
          <div className="bg-gray-200 text-gray-500 flex items-center justify-center w-full">
            Invalid thresholds
          </div>
        )}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>0</span>
        {valid && <><span style={{ marginLeft: `${m}%` }}>{m}</span><span style={{ marginLeft: `${h - m}%` }}>{h}</span><span style={{ marginLeft: `${c - h}%` }}>{c}</span></>}
        <span>100</span>
      </div>
    </div>
  );
}

// ─── Format PocketBase/ISO datetime as MM/DD/YYYY HH:MM (UTC) ─────────────────

function formatKevSyncTime(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  const mm  = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd  = String(d.getUTCDate()).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const hh  = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SettingsPanel({
  organizationId, currentUser, onClose, onSettingsSaved, onSyncKev,
  feeds = [], onAddFeed, onDeleteFeed, onToggleFeed,
  riskThresholds = { critical: 80, high: 60, medium: 40 },
  orgDefaultWeights = null,
  onThresholdsSaved,
  onDefaultWeightsSaved,
  catAnimationEnabled = true,
  onCatAnimationToggle,
  onClearAll,
}) {
  const [nvdKey,      setNvdKey]      = useState('');
  const [showKey,     setShowKey]     = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [successMsg,  setSuccessMsg]  = useState('');
  const [lastKevSync, setLastKevSync] = useState(null);
  const [kevSyncing,    setKevSyncing]    = useState(false);
  const [kevResult,     setKevResult]     = useState(null);

  // ── Risk tier threshold state ───────────────────────────────────────────────
  const [localThresholds,     setLocalThresholds]     = useState({ critical: 80, high: 60, medium: 40 });
  const [thresholdsError,     setThresholdsError]     = useState('');
  const [thresholdsSaving,    setThresholdsSaving]    = useState(false);
  const [thresholdsSuccessMsg, setThresholdsSuccessMsg] = useState('');

  // ── Default scoring weights state ───────────────────────────────────────────
  const [localWeights,     setLocalWeights]     = useState({ ...DEFAULT_WEIGHTS });
  const [weightsError,     setWeightsError]     = useState('');
  const [weightsSaving,    setWeightsSaving]    = useState(false);
  const [weightsSuccessMsg, setWeightsSuccessMsg] = useState('');

  // ── Feed management state (admin only) ─────────────────────────────────────
  const [addingFeed,     setAddingFeed]     = useState(false);
  const [newFeedName,    setNewFeedName]    = useState('');
  const [newFeedUrl,     setNewFeedUrl]     = useState('');
  const [addFeedError,   setAddFeedError]   = useState('');
  const [addFeedBusy,    setAddFeedBusy]    = useState(false);
  const [deletingFeedId, setDeletingFeedId] = useState(null);

  const isAdmin = currentUser?.role === 'admin';

  // Sync local threshold state when prop changes (e.g. after save in parent)
  useEffect(() => {
    setLocalThresholds({
      critical: riskThresholds.critical ?? 80,
      high:     riskThresholds.high     ?? 60,
      medium:   riskThresholds.medium   ?? 40,
    });
  }, [riskThresholds.critical, riskThresholds.high, riskThresholds.medium]);

  // Sync local weights state when prop changes
  useEffect(() => {
    setLocalWeights(orgDefaultWeights ? { ...orgDefaultWeights } : { ...DEFAULT_WEIGHTS });
  }, [orgDefaultWeights]);

  function isValidFeedUrl(url) {
    return url.startsWith('http://') || url.startsWith('https://');
  }

  async function handleAddFeed() {
    if (!newFeedName.trim())           { setAddFeedError('Name is required.'); return; }
    if (!isValidFeedUrl(newFeedUrl.trim())) { setAddFeedError('URL must start with http:// or https://.'); return; }
    setAddFeedBusy(true);
    setAddFeedError('');
    try {
      await onAddFeed(newFeedName.trim(), newFeedUrl.trim());
      setNewFeedName('');
      setNewFeedUrl('');
      setAddingFeed(false);
    } catch (e) {
      setAddFeedError('Failed to add feed: ' + (e?.message ?? 'unknown error'));
    } finally {
      setAddFeedBusy(false);
    }
  }

  async function handleDeleteFeed(feedId) {
    try {
      await onDeleteFeed(feedId);
      setDeletingFeedId(null);
    } catch (e) {
      setError('Failed to delete feed: ' + (e?.message ?? 'unknown error'));
    }
  }

  async function handleToggleFeed(feedId, enabled) {
    try {
      await onToggleFeed(feedId, enabled);
    } catch (e) {
      setError('Failed to update feed: ' + (e?.message ?? 'unknown error'));
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const record = await fetchOrgSettings(organizationId);
        setNvdKey(record?.nvd_api_key ?? '');
        setLastKevSync(record?.lastKevSync ?? null);
      } catch (e) {
        setError('Failed to load settings: ' + (e?.message ?? 'unknown error'));
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      await updateOrgSettings(organizationId, { nvd_api_key: nvdKey.trim() });
      setSuccessMsg('Settings saved.');
      onSettingsSaved({ nvd_api_key: nvdKey.trim() });
    } catch (e) {
      setError('Failed to save settings: ' + (e?.message ?? 'unknown error'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncKev() {
    setKevSyncing(true);
    setKevResult(null);
    try {
      const result = await onSyncKev();
      setKevResult(result);
      if (!result.error) {
        setLastKevSync(result.lastSync);
      }
    } catch {
      setKevResult({ error: 'network_error' });
    } finally {
      setKevSyncing(false);
    }
  }

  // ── Threshold handlers ──────────────────────────────────────────────────────

  function handleThresholdChange(key, raw) {
    const val = Math.max(0, Math.min(99, Math.round(Number(raw) || 0)));
    setLocalThresholds((prev) => ({ ...prev, [key]: val }));
    setThresholdsError('');
    setThresholdsSuccessMsg('');
  }

  async function handleSaveThresholds() {
    const { critical, high, medium } = localThresholds;
    const check = validateThresholds(critical, high, medium);
    if (!check.valid) { setThresholdsError(check.error); return; }

    setThresholdsSaving(true);
    setThresholdsError('');
    setThresholdsSuccessMsg('');
    try {
      await updateOrgSettings(organizationId, {
        criticalThreshold: critical,
        highThreshold:     high,
        mediumThreshold:   medium,
      });
      setThresholdsSuccessMsg('Thresholds saved. Vulnerabilities re-tiered.');
      onThresholdsSaved?.({ critical, high, medium });
    } catch (e) {
      setThresholdsError('Failed to save thresholds: ' + (e?.message ?? 'unknown error'));
    } finally {
      setThresholdsSaving(false);
    }
  }

  function handleResetThresholds() {
    setLocalThresholds({ critical: 80, high: 60, medium: 40 });
    setThresholdsError('');
    setThresholdsSuccessMsg('');
  }

  // ── Weights handlers ────────────────────────────────────────────────────────

  function handleWeightChange(key, raw) {
    const clamped = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
    setLocalWeights((prev) => redistributeWeights(prev, key, clamped));
    setWeightsError('');
    setWeightsSuccessMsg('');
  }

  async function handleSaveWeights() {
    const check = validateDefaultWeights(localWeights);
    if (!check.valid) { setWeightsError(check.error); return; }

    setWeightsSaving(true);
    setWeightsError('');
    setWeightsSuccessMsg('');
    try {
      await updateOrgSettings(organizationId, {
        defaultWeightCvss:          localWeights.cvss,
        defaultWeightCriticality:   localWeights.criticality,
        defaultWeightAssetCount:    localWeights.assetCount,
        defaultWeightExposure:      localWeights.exposure,
        defaultWeightExploitability: localWeights.exploitability,
        defaultWeightEpss:          localWeights.epss,
        defaultWeightDays:          localWeights.days,
      });
      setWeightsSuccessMsg('Default weights saved.');
      onDefaultWeightsSaved?.({ ...localWeights });
    } catch (e) {
      setWeightsError('Failed to save weights: ' + (e?.message ?? 'unknown error'));
    } finally {
      setWeightsSaving(false);
    }
  }

  function handleResetWeights() {
    setLocalWeights({ ...DEFAULT_WEIGHTS });
    setWeightsError('');
    setWeightsSuccessMsg('');
  }

  const weightTotal = Object.values(localWeights).reduce((s, v) => s + v, 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
          <p className="mt-0.5 text-sm text-gray-500">Organization configuration</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          <XIcon />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Global banners */}
        {successMsg && (
          <div className="flex items-center justify-between rounded-md bg-green-50 border border-green-200 px-4 py-2.5">
            <p className="text-sm text-green-700">{successMsg}</p>
            <button type="button" onClick={() => setSuccessMsg('')}
              className="ml-4 text-green-500 hover:text-green-700 text-lg leading-none">&times;</button>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-between rounded-md bg-red-50 border border-red-200 px-4 py-2.5">
            <p className="text-sm text-red-700">{error}</p>
            <button type="button" onClick={() => setError('')}
              className="ml-4 text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading settings…</div>
        ) : (
          <>
          {/* ── NVD API Configuration ── */}
          <SettingsSection
            title="NVD API Configuration"
            description="Connect to the NIST National Vulnerability Database to auto-populate CVE details in the Add Vulnerability form."
          >
            <div>
              <label className={labelClass}>
                NVD API Key <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={nvdKey}
                  onChange={(e) => setNvdKey(e.target.value)}
                  disabled={!isAdmin || saving}
                  placeholder={isAdmin ? 'Enter your NVD API key' : '••••••••••••••••'}
                  className={`flex-1 ${inputClass} ${!isAdmin ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  title={showKey ? 'Hide key' : 'Show key'}
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                  className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-gray-500
                             hover:bg-gray-50 hover:text-gray-700 transition-colors"
                >
                  {showKey ? <EyeSlashIcon /> : <EyeIcon />}
                </button>
              </div>

              <p className="mt-2 text-xs text-gray-500">
                An NVD API key increases the rate limit from 5 requests per 30 seconds to 50.
                Get a free key at{' '}
                <a
                  href="https://nvd.nist.gov/developers/request-an-api-key"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  nvd.nist.gov/developers/request-an-api-key
                </a>
              </p>

              {!isAdmin && (
                <p className="mt-2 text-xs text-amber-600">
                  Only admins can change settings. Contact your administrator.
                </p>
              )}
            </div>

            {isAdmin && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white
                             shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save API Key'}
                </button>
              </div>
            )}
          </SettingsSection>

          {/* ── Risk Tier Thresholds ── */}
          <SettingsSection
            title="Risk Tier Thresholds"
            description="Set the minimum composite score required for each risk tier. Saving will re-evaluate all loaded vulnerabilities immediately."
          >
            {/* Band visualizer */}
            <TierBandVisualizer
              critical={localThresholds.critical}
              high={localThresholds.high}
              medium={localThresholds.medium}
            />

            {/* Three inputs */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { key: 'critical', label: 'Critical threshold', color: 'text-red-700' },
                { key: 'high',     label: 'High threshold',     color: 'text-orange-700' },
                { key: 'medium',   label: 'Medium threshold',   color: 'text-yellow-700' },
              ].map(({ key, label, color }) => (
                <div key={key}>
                  <label className={`block text-sm font-medium mb-1 ${color}`}>{label}</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={localThresholds[key]}
                    onChange={(e) => handleThresholdChange(key, e.target.value)}
                    disabled={!isAdmin || thresholdsSaving}
                    className={`${inputClass} ${!isAdmin ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}
                  />
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-400">
              Default: Critical=80, High=60, Medium=40. Low is everything below Medium.
            </p>

            {/* Feedback */}
            {thresholdsSuccessMsg && (
              <p className="text-sm text-green-700">{thresholdsSuccessMsg}</p>
            )}
            {thresholdsError && (
              <p className="text-sm text-red-600">{thresholdsError}</p>
            )}

            {!isAdmin && (
              <p className="text-xs text-amber-600">
                Only admins can change settings. Contact your administrator.
              </p>
            )}

            {isAdmin && (
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleResetThresholds}
                  disabled={thresholdsSaving}
                  className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2 disabled:opacity-50"
                >
                  Reset to defaults
                </button>
                <button
                  type="button"
                  onClick={handleSaveThresholds}
                  disabled={thresholdsSaving}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white
                             shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {thresholdsSaving ? 'Saving…' : 'Save Thresholds'}
                </button>
              </div>
            )}
          </SettingsSection>

          {/* ── Default Scoring Weights ── */}
          <SettingsSection
            title="Default Scoring Weights"
            description="Set org-level starting weights for the composite risk score. Users can override these in the weight configuration panel. Weights must sum to 100."
          >
            {/* 7-factor grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
              {Object.keys(DEFAULT_WEIGHTS).map((key) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {WEIGHT_LABELS[key]}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={localWeights[key]}
                      onChange={(e) => handleWeightChange(key, e.target.value)}
                      disabled={!isAdmin || weightsSaving}
                      className={`w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm
                                  focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500
                                  ${!isAdmin ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Running total */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Total:</span>
              <span className={`text-sm font-semibold ${weightTotal === 100 ? 'text-green-700' : 'text-red-600'}`}>
                {weightTotal}%
              </span>
              {weightTotal !== 100 && (
                <span className="text-xs text-red-500">(must equal 100)</span>
              )}
            </div>

            {/* Feedback */}
            {weightsSuccessMsg && (
              <p className="text-sm text-green-700">{weightsSuccessMsg}</p>
            )}
            {weightsError && (
              <p className="text-sm text-red-600">{weightsError}</p>
            )}

            {!isAdmin && (
              <p className="text-xs text-amber-600">
                Only admins can change settings. Contact your administrator.
              </p>
            )}

            {isAdmin && (
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleResetWeights}
                  disabled={weightsSaving}
                  className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2 disabled:opacity-50"
                >
                  Reset to defaults
                </button>
                <button
                  type="button"
                  onClick={handleSaveWeights}
                  disabled={weightsSaving || weightTotal !== 100}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white
                             shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {weightsSaving ? 'Saving…' : 'Save Default Weights'}
                </button>
              </div>
            )}
          </SettingsSection>

          {/* ── CISA KEV Sync ── */}
          <SettingsSection
            title="CISA KEV Sync"
            description="Sync with the CISA Known Exploited Vulnerabilities catalog to automatically flag tracked vulnerabilities that are actively exploited in the wild."
          >
            <p className="text-sm text-gray-600">
              {lastKevSync
                ? <><span className="font-medium">Last synced:</span> {formatKevSyncTime(lastKevSync)}</>
                : <span className="text-gray-400">Never synced</span>}
            </p>

            {kevResult && !kevResult.error && (
              <div className="rounded-md bg-green-50 border border-green-200 px-4 py-2.5 text-sm text-green-700">
                {kevResult.newMatches.length === 0
                  ? 'Sync complete. No new KEV matches found.'
                  : `Sync complete. ${kevResult.newMatches.length} new KEV ${kevResult.newMatches.length === 1 ? 'match' : 'matches'} found: ${kevResult.newMatches.join(', ')}`}
              </div>
            )}
            {kevResult?.error && (
              <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
                KEV sync failed. Check your connection and try again.
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSyncKev}
                disabled={kevSyncing}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white
                           shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50
                           flex items-center gap-2"
              >
                {kevSyncing && (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                )}
                {kevSyncing ? 'Syncing…' : 'Sync Now'}
              </button>
              {kevResult && !kevResult.error && (
                <span className="text-xs text-gray-500">
                  {kevResult.totalMatched} total KEV {kevResult.totalMatched === 1 ? 'match' : 'matches'} in your tracked vulnerabilities
                </span>
              )}
            </div>
          </SettingsSection>

          {/* ── Feed Management (admin only) ── */}
          {isAdmin && (
            <SettingsSection
              title="Feed Management"
              description="Configure RSS/Atom feeds shown in the Intelligence tab. Changes take effect on the next refresh."
            >
              {feeds.length > 20 && (
                <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-700">
                  Large numbers of feeds may affect performance. Consider disabling feeds you no longer need.
                </div>
              )}

              {feeds.length === 0 ? (
                <p className="text-sm text-gray-400">No feeds configured.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {feeds.map((feed) => (
                    <li key={feed.id} className="py-3">
                      {deletingFeedId === feed.id ? (
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-700 flex-1">
                            Delete <span className="font-medium">{feed.name}</span>? This cannot be undone.
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteFeed(feed.id)}
                            className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingFeedId(null)}
                            className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={feed.enabled}
                            onClick={() => handleToggleFeed(feed.id, !feed.enabled)}
                            className={`mt-0.5 relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                                        transition-colors duration-200 focus:outline-none
                                        ${feed.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                          >
                            <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow
                                             transform transition-transform duration-200
                                             ${feed.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                          </button>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800">{feed.name}</p>
                            <p className="text-xs text-gray-400 truncate">{feed.url}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {feed.lastFetched
                                ? <>Last fetched: {formatDate(feed.lastFetched)}
                                    {feed.lastFetchedStatus === 'error' &&
                                      <span className="ml-1 text-red-500">(error)</span>}
                                  </>
                                : 'Never fetched'}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => setDeletingFeedId(feed.id)}
                            className="shrink-0 rounded-md border border-red-200 px-2 py-1 text-xs text-red-600
                                       hover:bg-red-50 hover:border-red-300 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {addingFeed ? (
                <div className="rounded-md border border-gray-200 p-4 space-y-3 mt-2">
                  <div>
                    <label className={labelClass}>Feed Name</label>
                    <input
                      type="text"
                      value={newFeedName}
                      onChange={(e) => setNewFeedName(e.target.value)}
                      placeholder="e.g. CISA Alerts"
                      className={inputClass}
                      disabled={addFeedBusy}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Feed URL</label>
                    <input
                      type="url"
                      value={newFeedUrl}
                      onChange={(e) => setNewFeedUrl(e.target.value)}
                      placeholder="https://example.com/feed.xml"
                      className={inputClass}
                      disabled={addFeedBusy}
                    />
                  </div>
                  {addFeedError && (
                    <p className="text-xs text-red-600">{addFeedError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAddFeed}
                      disabled={addFeedBusy}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white
                                 hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {addFeedBusy ? 'Adding…' : 'Add Feed'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddingFeed(false); setNewFeedName(''); setNewFeedUrl(''); setAddFeedError(''); }}
                      disabled={addFeedBusy}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700
                                 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingFeed(true)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700
                             hover:bg-gray-50 transition-colors"
                >
                  + Add Feed
                </button>
              )}
            </SettingsSection>
          )}
          </>
        )}

        {/* ── Preferences (all users) ── */}
        <SettingsSection title="Preferences" description="Personal display preferences stored locally on this device.">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <div>
              <span className="text-sm font-medium text-gray-700">Celebration animations</span>
              <p className="text-xs text-gray-500 mt-0.5">
                Play a 🐈‍⬛ animation when a vulnerability is marked Remediated.
              </p>
            </div>
            <div className="relative flex-shrink-0">
              <input
                type="checkbox"
                checked={catAnimationEnabled}
                onChange={(e) => onCatAnimationToggle?.(e.target.checked)}
                className="sr-only"
              />
              <div
                className={`h-6 w-11 rounded-full transition-colors ${catAnimationEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                onClick={() => onCatAnimationToggle?.(!catAnimationEnabled)}
              />
              <div
                className={`pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${catAnimationEnabled ? 'translate-x-5' : 'translate-x-0.5'}`}
              />
            </div>
          </label>
        </SettingsSection>

        {/* ── Data Management (admin only) ── */}
        {currentUser?.role === 'admin' && (
          <SettingsSection title="Data Management" description="Irreversible operations that affect all organization data.">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-700">Clear all vulnerability data</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Permanently deletes every vulnerability record in your organization. This cannot be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { onClearAll?.(); }}
                className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:border-red-400 transition-colors"
              >
                Clear All Data
              </button>
            </div>
          </SettingsSection>
        )}

        {/* ── Version ── */}
        <div className="pt-2 pb-4 text-center">
          <span className="font-display text-xs font-semibold text-gray-300">Vigil v1.0.0</span>
        </div>
      </div>
    </div>
  );
}
