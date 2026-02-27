import { useState, useEffect } from 'react';
import VulnForm from './components/VulnForm';
import VulnTable from './components/VulnTable';
import CsvImport from './components/CsvImport';
import { scoreVulnerability } from './utils/scoringEngine';

// --- localStorage persistence ---

const STORAGE_KEY = 'vuln-prioritization-data';

/**
 * Fill in defaults for any fields that didn't exist when a record was saved.
 * Add new fields here as the data model grows to keep old records valid.
 */
const RECORD_DEFAULTS = {
  affectedAssetCount: 0,
};

function migrateRecord(raw) {
  return { ...RECORD_DEFAULTS, ...raw };
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(migrateRecord);
  } catch {
    // Corrupt JSON or storage disabled — start fresh
    return [];
  }
}

function saveToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded or storage disabled — fail silently
  }
}

// --- App ---

export default function App() {
  // Lazy initializer: runs once on mount, not on every render
  const [vulnerabilities, setVulnerabilities] = useState(() => loadFromStorage());

  // Auto-save whenever the list changes (add, delete, or import)
  useEffect(() => {
    saveToStorage(vulnerabilities);
  }, [vulnerabilities]);

  function handleAdd(vuln) {
    const scored = scoreVulnerability(vuln);
    setVulnerabilities((prev) => [...prev, scored]);
  }

  function handleDelete(id) {
    setVulnerabilities((prev) => prev.filter((v) => v.id !== id));
  }

  function handleImport(records) {
    const scored = records.map(scoreVulnerability);
    setVulnerabilities((prev) => [...prev, ...scored]);
  }

  function handleClearAll() {
    if (
      !window.confirm(
        'Delete all vulnerability data?\n\nThis will permanently remove all entries from this browser and cannot be undone.'
      )
    ) {
      return;
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setVulnerabilities([]);
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-5 w-5 text-white"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Vulnerability Prioritization Tool</h1>
                <p className="text-xs text-gray-500">Sprint 2 &mdash; Bulk import &amp; composite risk scoring</p>
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

      {/* Scoring legend */}
      <div className="bg-blue-50 border-b border-blue-100">
        <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-blue-700">
            <span className="font-semibold">Score weights:</span>
            <span>Asset Criticality 25%</span>
            <span>Asset Count 20%</span>
            <span>CVSS 20%</span>
            <span>Internet Exposure 15%</span>
            <span>Exploitability 15%</span>
            <span>Age 5%</span>
            <span className="ml-auto flex items-center gap-3 font-medium">
              <Pill color="bg-red-600 text-white">Critical 80–100</Pill>
              <Pill color="bg-orange-500 text-white">High 60–79</Pill>
              <Pill color="bg-yellow-400 text-yellow-900">Medium 40–59</Pill>
              <Pill color="bg-green-500 text-white">Low 0–39</Pill>
            </span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        <CsvImport onImport={handleImport} />
        <VulnForm onAdd={handleAdd} />
        <VulnTable vulnerabilities={vulnerabilities} onDelete={handleDelete} />
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
