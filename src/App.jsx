import { useState, useEffect } from 'react';
import VulnForm from './components/VulnForm';
import VulnTable from './components/VulnTable';
import CsvImport from './components/CsvImport';
import WeightConfig from './components/WeightConfig';
import { scoreVulnerability, DEFAULT_WEIGHTS } from './utils/scoringEngine';

// ─── localStorage keys ────────────────────────────────────────────────────────

const DATA_KEY    = 'vuln-prioritization-data';
const WEIGHTS_KEY = 'vuln-prioritization-weights';

// ─── Persistence helpers ──────────────────────────────────────────────────────

const RECORD_DEFAULTS = { affectedAssetCount: 0 };

function migrateRecord(raw) {
  return { ...RECORD_DEFAULTS, ...raw };
}

function loadWeights() {
  try {
    const raw = localStorage.getItem(WEIGHTS_KEY);
    if (!raw) return { ...DEFAULT_WEIGHTS };
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      !Object.keys(DEFAULT_WEIGHTS).every((k) => typeof parsed[k] === 'number')
    ) {
      return { ...DEFAULT_WEIGHTS };
    }
    return parsed;
  } catch {
    return { ...DEFAULT_WEIGHTS };
  }
}

function loadFromStorage(weights) {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Migrate schema and re-score with current weights to ensure consistency
    return parsed.map((r) => scoreVulnerability(migrateRecord(r), weights));
  } catch {
    return [];
  }
}

function saveToStorage(data) {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded or storage disabled — fail silently
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  // Weights must be initialised before vulnerabilities so re-scoring on startup is correct
  const [weights, setWeights] = useState(() => loadWeights());
  const [vulnerabilities, setVulnerabilities] = useState(() => loadFromStorage(loadWeights()));

  // Auto-save whenever state changes
  useEffect(() => { saveToStorage(vulnerabilities); }, [vulnerabilities]);
  useEffect(() => {
    try { localStorage.setItem(WEIGHTS_KEY, JSON.stringify(weights)); } catch {}
  }, [weights]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleAdd(vuln) {
    setVulnerabilities((prev) => [...prev, scoreVulnerability(vuln, weights)]);
  }

  function handleDelete(id) {
    setVulnerabilities((prev) => prev.filter((v) => v.id !== id));
  }

  function handleImport(records) {
    setVulnerabilities((prev) => [...prev, ...records.map((r) => scoreVulnerability(r, weights))]);
  }

  function handleWeightsChange(newWeights) {
    setWeights(newWeights);
    // Immediately re-score every stored vulnerability with the new weights
    setVulnerabilities((prev) => prev.map((v) => scoreVulnerability(v, newWeights)));
  }

  function handleClearAll() {
    if (
      !window.confirm(
        'Delete all vulnerability data?\n\nThis will permanently remove all entries from this browser and cannot be undone.'
      )
    ) {
      return;
    }
    try { localStorage.removeItem(DATA_KEY); } catch {}
    setVulnerabilities([]);
  }

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
                <p className="text-xs text-gray-500">Sprint 3 &mdash; Prioritization, filtering and export</p>
              </div>
            </div>

            {vulnerabilities.length > 0 && (
              <button
                onClick={handleClearAll}
                className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors"
              >
                Clear All Data
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Tier / weight legend ── */}
      <div className="bg-blue-50 border-b border-blue-100">
        <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-blue-700">
            <span className="font-semibold">Score weights:</span>
            <span>Criticality {weights.criticality}%</span>
            <span>Asset Count {weights.assetCount}%</span>
            <span>CVSS {weights.cvss}%</span>
            <span>Exposure {weights.exposure}%</span>
            <span>Exploitability {weights.exploitability}%</span>
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

      {/* ── Main content ── */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        <CsvImport onImport={handleImport} />
        <VulnForm onAdd={handleAdd} />
        <WeightConfig weights={weights} onWeightsChange={handleWeightsChange} />
        <VulnTable vulnerabilities={vulnerabilities} onDelete={handleDelete} weights={weights} />
      </main>
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
