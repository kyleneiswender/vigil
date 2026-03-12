import { useState, useEffect, useCallback, useRef } from 'react';
import VulnForm             from './components/VulnForm';
import VulnTable            from './components/VulnTable';
import VulnEditPanel        from './components/VulnEditPanel';
import CsvImport            from './components/CsvImport';
import WeightConfig         from './components/WeightConfig';
import Auth                 from './components/Auth';
import UserManagementPanel  from './components/UserManagementPanel';
import SettingsPanel        from './components/SettingsPanel';
import IntelligenceTab      from './components/IntelligenceTab';
import { pb, isAuthenticated, getCurrentUser, logout } from './lib/pocketbase.js';
import {
  initializeUser,
  fetchVulnerabilities,
  createVulnerability,
  deleteVulnerability,
  fetchScoringWeights,
  updateScoringWeights,
  updateVulnerability,
  fetchOrgSettings,
  updateOrgSettings,
  syncKevFeed,
  fetchRssFeeds,
  createRssFeed,
  updateRssFeed,
  deleteRssFeed,
} from './lib/api.js';
import { scoreVulnerability, DEFAULT_WEIGHTS } from './utils/scoringEngine';

const DEFAULT_FEEDS = [
  { name: 'CISA Cyber Alerts',   url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml'},
  { name: 'CISA News', url: 'https://www.cisa.gov/news.xml'},
  { name: 'SANS Internet Storm', url: 'https://isc.sans.edu/rssfeed_full.xml' },
  { name: 'Krebs on Security',   url: 'https://krebsonsecurity.com/feed/'     },
];

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [authed,          setAuthed]          = useState(() => isAuthenticated());
  const [loading,         setLoading]         = useState(true);
  const [loadFailed,      setLoadFailed]      = useState(false);
  const [error,           setError]           = useState('');
  const organizationIdRef = useRef(null);
  const [vulnerabilities, setVulnerabilities] = useState([]);
  const [weights,         setWeights]         = useState({ ...DEFAULT_WEIGHTS });
  const [editingVuln,     setEditingVuln]     = useState(null);
  const [showUserMgmt,    setShowUserMgmt]    = useState(false);
  const [showSettings,    setShowSettings]    = useState(false);
  const [orgSettings,     setOrgSettings]     = useState(null);
  const [rssFeeds,        setRssFeeds]        = useState([]);
  const [activeTab,       setActiveTab]       = useState('vulnerabilities');

  // ── Re-check auth on authStore changes (e.g. token expiry) ─────────────────
  useEffect(() => {
    const unsub = pb.authStore.onChange(() => {
      setAuthed(isAuthenticated());
    });
    return unsub;
  }, []);

  // ── Load data from PocketBase after auth ────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    setError('');
    try {
      // Best-effort token refresh so pb.authStore.model reflects any server-side
      // changes (e.g. org reassignment) since last login.
      // - requestKey: null prevents React StrictMode double-invocation from
      //   auto-cancelling the first call in dev mode (ClientResponseError 0).
      // - Wrapped in try-catch so a transient network error doesn't block the
      //   app; we fall back to the model already in localStorage.
      if (pb.authStore.isValid) {
        try {
          const authData = await pb.collection('users').authRefresh({ requestKey: null });
          pb.authStore.save(authData.token, authData.record);
        } catch (_) {
          // Proceed with existing auth store data.
        }
      }

      // initializeUser() reads organization directly from pb.authStore.model.
      const orgId = initializeUser();
      if (!orgId) {
        setError('Your account has no organization assigned. Contact your administrator.');
        setLoading(false);
        return;
      }
      organizationIdRef.current = orgId;

      const [records, weightsRecord, settingsRecord, feedsData] = await Promise.all([
        fetchVulnerabilities(orgId),
        fetchScoringWeights(orgId),
        fetchOrgSettings(orgId),
        fetchRssFeeds(orgId),
      ]);

      setOrgSettings(settingsRecord);
      setRssFeeds(feedsData);

      const resolvedWeights = weightsRecord
        ? {
            cvss:           weightsRecord.cvss,
            criticality:    weightsRecord.criticality,
            assetCount:     weightsRecord.assetCount,
            exposure:       weightsRecord.exposure,
            exploitability: weightsRecord.exploitability,
            epss:           weightsRecord.epss ?? 10,
            days:           weightsRecord.days,
          }
        : { ...DEFAULT_WEIGHTS };

      setWeights(resolvedWeights);
      // Re-score on load to keep scores consistent with current weights
      const scoredRecords = records.map((r) => scoreVulnerability(r, resolvedWeights));
      setVulnerabilities(scoredRecords);

      // Auto-sync KEV feed in the background if never synced or last sync > 24 hours ago
      const lastSync = settingsRecord?.lastKevSync;
      const needsSync = !lastSync || (Date.now() - new Date(lastSync).getTime() > 24 * 60 * 60 * 1000);
      if (needsSync) {
        syncKevFeed(scoredRecords, orgId)
          .then(async (result) => {
            if (!result.error) {
              const fresh = await fetchVulnerabilities(orgId);
              setVulnerabilities(fresh.map((r) => scoreVulnerability(r, resolvedWeights)));
              setOrgSettings((prev) => ({ ...prev, lastKevSync: result.lastSync }));
            }
          })
          .catch(() => {}); // silent background failure — non-blocking
      }

      // Seed three default RSS feeds once if not already done
      if (!settingsRecord?.defaultFeedsSeeded && feedsData.length === 0) {
        Promise.all(DEFAULT_FEEDS.map((f) => createRssFeed(orgId, f.name, f.url)))
          .then((newFeeds) => {
            setRssFeeds(newFeeds);
            return updateOrgSettings(orgId, { defaultFeedsSeeded: true });
          })
          .then(() => setOrgSettings((prev) => ({ ...prev, defaultFeedsSeeded: true })))
          .catch(() => {}); // non-blocking
      }
    } catch (err) {
      console.error('[loadData] error:', err);
      setError('Failed to load data. Is PocketBase running on http://localhost:8090?');
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) loadData();
  }, [authed, loadData]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleAdd(vuln) {
    const scored = scoreVulnerability(vuln, weights);
    try {
      const record = await createVulnerability(scored, organizationIdRef.current);
      const newVuln = scoreVulnerability(record, weights);
      setVulnerabilities((prev) => [newVuln, ...prev]);

      // Check the new CVE against the KEV catalog in the background
      syncKevFeed([newVuln], organizationIdRef.current)
        .then(async (result) => {
          if (!result.error && result.newMatches.length > 0) {
            const fresh = await fetchVulnerabilities(organizationIdRef.current);
            setVulnerabilities(fresh.map((r) => scoreVulnerability(r, weights)));
            setOrgSettings((prev) => ({ ...prev, lastKevSync: result.lastSync }));
          }
        })
        .catch(() => {});
    } catch (err) {
      setError('Failed to save vulnerability: ' + (err?.message ?? 'unknown error'));
    }
  }

  async function handleDelete(id) {
    try {
      await deleteVulnerability(id, organizationIdRef.current);
      setVulnerabilities((prev) => prev.filter((v) => v.id !== id));
    } catch (err) {
      setError('Failed to delete vulnerability: ' + (err?.message ?? 'unknown error'));
    }
  }

  async function handleImport(records) {
    const scored = records.map((r) => scoreVulnerability(r, weights));
    try {
      const saved = await Promise.all(
        scored.map((r) => createVulnerability(r, organizationIdRef.current))
      );
      const newVulns = saved.map((r) => scoreVulnerability(r, weights));
      setVulnerabilities((prev) => [...newVulns, ...prev]);

      // Check all newly imported CVEs against the KEV catalog in the background
      syncKevFeed(newVulns, organizationIdRef.current)
        .then(async (result) => {
          if (!result.error && result.newMatches.length > 0) {
            const fresh = await fetchVulnerabilities(organizationIdRef.current);
            setVulnerabilities(fresh.map((r) => scoreVulnerability(r, weights)));
            setOrgSettings((prev) => ({ ...prev, lastKevSync: result.lastSync }));
          }
        })
        .catch(() => {});
    } catch (err) {
      setError('Import failed: ' + (err?.message ?? 'unknown error'));
    }
  }

  async function handleWeightsChange(newWeights) {
    setWeights(newWeights);
    setVulnerabilities((prev) => prev.map((v) => scoreVulnerability(v, newWeights)));
    try {
      await updateScoringWeights(organizationIdRef.current, newWeights);
    } catch (err) {
      // Non-blocking — UI already updated; log a warning only
      console.warn('Failed to persist scoring weights:', err);
    }
  }

  async function handleClearAll() {
    if (
      !window.confirm(
        'Delete all vulnerability data?\n\nThis will permanently remove all entries and cannot be undone.'
      )
    ) return;

    try {
      await Promise.all(
        vulnerabilities.map((v) => deleteVulnerability(v.id, organizationIdRef.current))
      );
      setVulnerabilities([]);
    } catch (err) {
      setError('Failed to delete all records: ' + (err?.message ?? 'unknown error'));
    }
  }

  async function handleEditSave(id, updatedFields) {
    const scored = scoreVulnerability(updatedFields, weights);
    try {
      const record = await updateVulnerability(id, scored, organizationIdRef.current);
      setVulnerabilities((prev) =>
        prev.map((v) => (v.id === id ? scoreVulnerability(record, weights) : v))
      );
      setEditingVuln(null);
    } catch (err) {
      setError('Failed to update vulnerability: ' + (err?.message ?? 'unknown error'));
    }
  }

  async function handleKevSync() {
    const result = await syncKevFeed(vulnerabilities, organizationIdRef.current);
    if (!result.error) {
      const fresh = await fetchVulnerabilities(organizationIdRef.current);
      setVulnerabilities(fresh.map((r) => scoreVulnerability(r, weights)));
      setOrgSettings((prev) => ({ ...prev, lastKevSync: result.lastSync }));
    }
    return result;
  }

  async function handleAddFeed(name, url) {
    const feed = await createRssFeed(organizationIdRef.current, name, url);
    setRssFeeds((prev) => [...prev, feed]);
    return feed;
  }

  async function handleDeleteFeed(feedId) {
    await deleteRssFeed(feedId);
    setRssFeeds((prev) => prev.filter((f) => f.id !== feedId));
  }

  async function handleToggleFeed(feedId, enabled) {
    await updateRssFeed(feedId, { enabled });
    setRssFeeds((prev) => prev.map((f) => f.id === feedId ? { ...f, enabled } : f));
  }

  function handleFeedMetaUpdated(feedId, updates) {
    setRssFeeds((prev) => prev.map((f) => f.id === feedId ? { ...f, ...updates } : f));
  }

  function handleLogout() {
    logout();
    organizationIdRef.current = null;
    setVulnerabilities([]);
    setWeights({ ...DEFAULT_WEIGHTS });
    setOrgSettings(null);
    setRssFeeds([]);
    setActiveTab('vulnerabilities');
    setLoadFailed(false);
    setError('');
  }

  // ── Render: unauthenticated ──────────────────────────────────────────────────

  if (!authed) {
    return <Auth onAuthenticated={() => setAuthed(true)} />;
  }

  // ── Render: loading ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading…</p>
      </div>
    );
  }

  // ── Render: load failed (PocketBase unreachable / auth error) ────────────────
  // Do NOT fall through to the main form — submissions would have a null org ID.

  if (loadFailed) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 max-w-md w-full mx-4 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Unable to load</h2>
          <p className="text-sm text-red-600">{error}</p>
          <div className="flex gap-3">
            <button
              onClick={() => loadData()}
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const user = getCurrentUser();

  // ── Render: main app ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-white">
                  <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Vulnerability Prioritization Tool</h1>
                <p className="text-xs text-gray-500">v0.8.1 &mdash; Intelligence feed</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Error banner */}
              {error && (
                <span className="hidden sm:block max-w-xs truncate rounded-md bg-red-50 border border-red-200 px-3 py-1 text-xs text-red-700">
                  {error}
                </span>
              )}
              {/* User info */}
              {user && (
                <span className="hidden sm:block text-xs text-gray-500 truncate max-w-[180px]">
                  {user.email}
                </span>
              )}
              {/* Settings (all users) */}
              <button
                onClick={() => setShowSettings(true)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Settings
              </button>
              {/* Manage Users (admin only) */}
              {user?.role === 'admin' && (
                <button
                  onClick={() => setShowUserMgmt(true)}
                  className="rounded-md border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                >
                  Manage Users
                </button>
              )}
              {/* Clear all */}
              {vulnerabilities.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors"
                >
                  Clear All
                </button>
              )}
              {/* Logout */}
              <button
                onClick={handleLogout}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>

          {/* Inline error on small screens */}
          {error && (
            <div role="alert" className="mt-2 sm:hidden rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>
      </header>

      {/* ── Tab navigation ── */}
      <div className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-0" aria-label="Main navigation">
            <TabButton active={activeTab === 'vulnerabilities'} onClick={() => setActiveTab('vulnerabilities')}>
              Vulnerabilities
            </TabButton>
            <TabButton active={activeTab === 'intelligence'} onClick={() => setActiveTab('intelligence')}>
              Intelligence
            </TabButton>
          </nav>
        </div>
      </div>

      {/* ── Tier / weight legend (Vulnerabilities tab only) ── */}
      {activeTab === 'vulnerabilities' && (
        <div className="bg-blue-50 border-b border-blue-100">
          <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-blue-700">
              <span className="font-semibold">Score weights:</span>
              <span>Criticality {weights.criticality}%</span>
              <span>CVSS {weights.cvss}%</span>
              <span>Asset Count {weights.assetCount}%</span>
              <span>Exposure {weights.exposure}%</span>
              <span>Exploitability {weights.exploitability}%</span>
              <span>EPSS {weights.epss}%</span>
              <span>Age {weights.days}%</span>
              <span className="ml-auto flex items-center gap-3 font-medium">
                <Pill color="bg-red-600 text-white">Critical 80–100</Pill>
                <Pill color="bg-orange-500 text-white">High 60–79</Pill>
                <Pill color="bg-yellow-400 text-yellow-900">Medium 40–59</Pill>
                <Pill color="bg-green-500 text-white">Low 0–39</Pill>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab content ── */}
      {activeTab === 'vulnerabilities' && (
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
          <CsvImport    onImport={handleImport} />
          <VulnForm     onAdd={handleAdd} nvdApiKey={orgSettings?.nvd_api_key ?? ''} />
          <WeightConfig weights={weights} onWeightsChange={handleWeightsChange} />
          <VulnTable    vulnerabilities={vulnerabilities} onDelete={handleDelete} onEdit={(vuln) => setEditingVuln(vuln)} weights={weights} />
        </main>
      )}
      {activeTab === 'intelligence' && (
        <IntelligenceTab feeds={rssFeeds} onFeedUpdated={handleFeedMetaUpdated} />
      )}

      {editingVuln && (
        <VulnEditPanel
          vuln={editingVuln}
          organizationId={organizationIdRef.current}
          onSave={handleEditSave}
          onCancel={() => setEditingVuln(null)}
        />
      )}

      {showUserMgmt && (
        <UserManagementPanel
          organizationId={organizationIdRef.current}
          currentUserId={user?.id}
          onClose={() => setShowUserMgmt(false)}
        />
      )}

      {showSettings && (
        <SettingsPanel
          organizationId={organizationIdRef.current}
          currentUser={user}
          onClose={() => setShowSettings(false)}
          onSettingsSaved={(updated) => setOrgSettings((prev) => ({ ...prev, ...updated }))}
          onSyncKev={handleKevSync}
          feeds={rssFeeds}
          onAddFeed={handleAddFeed}
          onDeleteFeed={handleDeleteFeed}
          onToggleFeed={handleToggleFeed}
        />
      )}
    </div>
  );
}

function Pill({ color, children }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      {children}
    </span>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors
        ${active
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
        }`}
    >
      {children}
    </button>
  );
}
