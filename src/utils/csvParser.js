/**
 * CSV import utilities for the vulnerability prioritization tool.
 * No external dependencies — native browser / JS only.
 */

// ─── CSV Parser ───────────────────────────────────────────────────────────────

/**
 * Parse a CSV string into structured header and data rows.
 *
 * Handles:
 *  - Quoted fields (fields may contain commas or newlines inside quotes)
 *  - Escaped double-quotes inside quoted fields ("")
 *  - CRLF and LF line endings
 *  - UTF-8 BOM
 *
 * @param {string} text - Raw CSV file contents
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseCSV(text) {
  const src = text.replace(/^\uFEFF/, ''); // strip UTF-8 BOM

  const allRows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        // Escaped quote inside a quoted field
        field += '"';
        i++;
      } else if (ch === '"') {
        // End of quoted field
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r' && src[i + 1] === '\n') {
      row.push(field.trim());
      allRows.push(row);
      row = [];
      field = '';
      i++; // skip the \n
    } else if (ch === '\n') {
      row.push(field.trim());
      allRows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  // Flush remaining content after the last newline
  row.push(field.trim());
  if (row.some((f) => f !== '')) allRows.push(row);

  if (allRows.length === 0) return { headers: [], rows: [] };

  const [rawHeaders, ...dataRows] = allRows;
  const headers = rawHeaders.map((h) => h.trim());
  // Drop rows that are entirely empty (e.g. trailing blank lines)
  const rows = dataRows.filter((r) => r.some((c) => c !== ''));

  return { headers, rows };
}

// ─── Internal field definitions ───────────────────────────────────────────────

/**
 * Canonical list of app fields that can be mapped from CSV columns.
 *
 * `hints` are normalized (lowercase, alphanumeric only) variants of common
 * CSV column names. Qualys typically exports affected host counts as
 * "Hosts", "Asset Count", or "Affected Hosts".
 */
export const INTERNAL_FIELDS = [
  {
    key: 'cveId',
    label: 'CVE ID',
    required: true,
    hints: ['cveid', 'cve', 'vulnerabilityid', 'vulnid', 'id'],
  },
  {
    key: 'title',
    label: 'Title / Description',
    required: false,
    hints: ['title', 'name', 'description', 'vulnerabilityname', 'vulnname', 'summary', 'vulnerabilitytitle'],
  },
  {
    key: 'cvssScore',
    label: 'CVSS v3 Base Score',
    required: true,
    hints: [
      'cvss',
      'cvssscore',
      'cvssv3',
      'cvss3',
      'basescore',
      'cvssbasescore',
      'cvssv3basescore',
      'cvssv3score',
      'cvssbase',
    ],
  },
  {
    key: 'assetCriticality',
    label: 'Asset Criticality',
    required: false,
    hints: ['criticality', 'assetcriticality', 'severity', 'assettype', 'assetseverity'],
  },
  {
    key: 'internetFacing',
    label: 'Internet Facing',
    required: false,
    hints: ['internetfacing', 'internetexposure', 'external', 'public', 'facing', 'internet'],
  },
  {
    key: 'exploitability',
    label: 'Exploitability',
    required: false,
    hints: ['exploitability', 'exploitstatus', 'exploitavailable', 'exploited', 'exploit'],
  },
  {
    key: 'daysSinceDiscovery',
    label: 'Days Since Discovery',
    required: false,
    hints: ['dayssincediscovery', 'daysold', 'agedays', 'age', 'days', 'dayssince'],
  },
  {
    key: 'affectedAssetCount',
    label: 'Affected Asset Count',
    required: false,
    // Qualys common column names covered here
    hints: [
      'affectedassetcount',
      'affectedhosts',
      'hosts',
      'assetcount',
      'hostcount',
      'numhosts',
      'assets',
      'affectedassets',
    ],
  },
];

// ─── Auto-detection ───────────────────────────────────────────────────────────

function normalizeHeader(h) {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Suggest column-index mappings by matching normalized CSV headers against
 * each field's known hint list. First hint match wins.
 *
 * @param {string[]} headers - CSV column header names
 * @returns {Record<string, number|null>} Map of fieldKey → column index, or null if unmatched
 */
export function autoDetectMapping(headers) {
  const normalized = headers.map(normalizeHeader);
  const mapping = {};

  for (const field of INTERNAL_FIELDS) {
    let match = null;
    for (let i = 0; i < normalized.length; i++) {
      if (field.hints.includes(normalized[i])) {
        match = i;
        break;
      }
    }
    mapping[field.key] = match;
  }

  return mapping;
}

// ─── Value coercions ──────────────────────────────────────────────────────────

const CRITICALITY_VALUES = ['Low', 'Medium', 'High', 'Critical'];
const EXPLOITABILITY_VALUES = ['Theoretical', 'PoC Exists', 'Actively Exploited'];

function parseInternetFacing(raw) {
  const v = raw.toLowerCase().trim();
  return ['true', 'yes', '1', 'y', 'external', 'public', 'internet-facing', 'internet facing'].includes(v);
}

function parseAssetCriticality(raw) {
  const v = raw.trim();
  return CRITICALITY_VALUES.find((c) => c.toLowerCase() === v.toLowerCase()) ?? null;
}

function parseExploitability(raw) {
  const v = raw.trim();
  const exact = EXPLOITABILITY_VALUES.find((e) => e.toLowerCase() === v.toLowerCase());
  if (exact) return exact;
  const lower = v.toLowerCase();
  if (lower.includes('active') || lower.includes('wild')) return 'Actively Exploited';
  if (lower.includes('poc') || lower.includes('proof') || lower.includes('public exploit')) return 'PoC Exists';
  return null;
}

// ─── Row processing ───────────────────────────────────────────────────────────

/**
 * Apply a field mapping to every data row, validate required fields, and
 * coerce values to the app's internal types.
 *
 * Required fields: cveId, cvssScore.
 * All other fields fall back to sensible defaults when unmapped or blank.
 *
 * @param {string[][]} rows    - CSV data rows
 * @param {string[]}   headers - CSV column headers (unused; kept for symmetry)
 * @param {Record<string, number|null>} mapping - fieldKey → column index
 * @returns {{ valid: object[], invalid: { rowNumber: number, row: string[], errors: string[] }[] }}
 */
export function applyMapping(rows, headers, mapping) {
  const valid = [];
  const invalid = [];

  const getCell = (row, key) => {
    const idx = mapping[key];
    if (idx === null || idx === undefined) return '';
    return (row[idx] ?? '').trim();
  };

  rows.forEach((row, i) => {
    const rowNumber = i + 1; // 1-indexed for display
    const errors = [];

    // ── Required: CVE ID ──────────────────────────────────────────────────────
    const cveId = getCell(row, 'cveId');
    if (!cveId) errors.push('CVE ID is blank');

    // ── Required: CVSS score ──────────────────────────────────────────────────
    const cvssRaw = getCell(row, 'cvssScore');
    const cvssScore = parseFloat(cvssRaw);
    if (cvssRaw === '') {
      errors.push('CVSS v3 score is missing');
    } else if (isNaN(cvssScore) || cvssScore < 0 || cvssScore > 10) {
      errors.push(`CVSS score "${cvssRaw}" is not a valid 0–10 value`);
    }

    if (errors.length > 0) {
      invalid.push({ rowNumber, row, errors });
      return;
    }

    // ── Optional fields with defaults ─────────────────────────────────────────
    const title = getCell(row, 'title') || cveId;

    const critRaw = getCell(row, 'assetCriticality');
    const assetCriticality = (critRaw && parseAssetCriticality(critRaw)) || 'Medium';

    const internetRaw = getCell(row, 'internetFacing');
    const internetFacing = internetRaw !== '' ? parseInternetFacing(internetRaw) : false;

    const exploitRaw = getCell(row, 'exploitability');
    const exploitability = (exploitRaw && parseExploitability(exploitRaw)) || 'Theoretical';

    const daysRaw = getCell(row, 'daysSinceDiscovery');
    const daysSinceDiscovery = daysRaw !== '' ? Math.max(0, parseInt(daysRaw, 10) || 0) : 0;

    const assetsRaw = getCell(row, 'affectedAssetCount');
    const affectedAssetCount = assetsRaw !== '' ? Math.max(0, parseInt(assetsRaw, 10) || 0) : 1;

    valid.push({
      id: crypto.randomUUID(),
      cveId,
      title,
      cvssScore,
      assetCriticality,
      internetFacing,
      exploitability,
      daysSinceDiscovery,
      affectedAssetCount,
    });
  });

  return { valid, invalid };
}
