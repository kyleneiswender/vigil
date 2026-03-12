import { useState, useEffect } from 'react';
import { fetchOrgSettings, updateOrgSettings } from '../lib/api.js';

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

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Full-page overlay for org-level settings.
 * Visible to all authenticated users; only admins can save changes.
 * Designed to be extensible — future sprints add sections for EPSS, KEV, RSS.
 *
 * @param {{ organizationId: string, currentUser: object, onClose: () => void, onSettingsSaved: (settings: object) => void }} props
 */
/** Format a PocketBase/ISO datetime as MM/DD/YYYY HH:MM (UTC). */
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

export default function SettingsPanel({ organizationId, currentUser, onClose, onSettingsSaved, onSyncKev }) {
  const [nvdKey,      setNvdKey]      = useState('');
  const [showKey,     setShowKey]     = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [successMsg,  setSuccessMsg]  = useState('');
  const [lastKevSync, setLastKevSync] = useState(null);
  const [kevSyncing,  setKevSyncing]  = useState(false);
  const [kevResult,   setKevResult]   = useState(null);

  const isAdmin = currentUser?.role === 'admin';

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
        {/* Banners */}
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
          <SettingsSection
            title="NVD API Configuration"
            description="Connect to the NIST National Vulnerability Database to auto-populate CVE details in the Add Vulnerability form."
          >
            {/* API key input */}
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

            {/* Save */}
            {isAdmin && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white
                             shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Settings'}
                </button>
              </div>
            )}
          </SettingsSection>

          <SettingsSection
            title="CISA KEV Sync"
            description="Sync with the CISA Known Exploited Vulnerabilities catalog to automatically flag tracked vulnerabilities that are actively exploited in the wild."
          >
            {/* Last synced */}
            <p className="text-sm text-gray-600">
              {lastKevSync
                ? <><span className="font-medium">Last synced:</span> {formatKevSyncTime(lastKevSync)}</>
                : <span className="text-gray-400">Never synced</span>}
            </p>

            {/* Sync result message */}
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

            {/* Sync Now button */}
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
          </>
        )}
      </div>
    </div>
  );
}
