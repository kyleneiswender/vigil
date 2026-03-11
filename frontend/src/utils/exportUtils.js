/**
 * Export utilities — CSV download and PDF via browser print.
 * No external dependencies; uses native browser APIs only.
 */

// ─── Date formatting ──────────────────────────────────────────────────────────

/**
 * Format an ISO 8601 date string (as returned by PocketBase) as DD/MM/YYYY.
 * PocketBase created timestamps look like '2026-03-01 18:09:57.642Z'.
 * Returns '-' for null, undefined, empty string, or unparseable input.
 *
 * @param {string|null|undefined} dateString
 * @returns {string} Formatted date or '-'
 */
export function formatDate(dateString) {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    const dd   = String(date.getDate()).padStart(2, '0');
    const mm   = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  } catch {
    return '-';
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Sanitize a value against CSV formula injection (Fix B).
 * If the stringified value starts with a spreadsheet formula-trigger character
 * (=  +  -  @  |  tab), a tab is prepended so that Excel/Sheets treats the
 * cell as plain text instead of evaluating a formula.
 *
 * Exported for unit testing.
 *
 * @param {*} v - Any value; null/undefined become ''
 * @returns {string} Safe string ready for CSV quoting
 */
export function sanitizeCsvField(v) {
  const s = String(v ?? '');
  if (s === '') return s;
  return /^[=+\-@|\t]/.test(s) ? '\t' + s : s;
}

/**
 * Wrap a CSV field in quotes if it contains commas, quotes, newlines, or tabs.
 * Tabs may be injected by sanitizeCsvField and must be quoted so they stay
 * inside the field boundary.
 */
function escapeField(v) {
  const s = sanitizeCsvField(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r') || s.includes('\t')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

/**
 * Escape a string for safe interpolation into an HTML document (Fix A).
 * Prevents stored XSS when user-supplied data is written via document.write().
 *
 * @param {*} v - Any value; null/undefined become ''
 * @returns {string} HTML-entity-escaped string
 */
function htmlEscape(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ─── CSV export ───────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  'CVE ID',
  'Title',
  'CVSS v3 Base Score',
  'Asset Criticality',
  'Internet Facing',
  'Exploitability',
  'Days Since Discovery',
  'Affected Asset Count',
  'Composite Score',
  'Risk Tier',
  'Date Added',
];

/**
 * Download the given rows as a UTF-8 CSV file.
 * The export reflects the currently filtered + sorted view passed in.
 *
 * @param {object[]} rows - Scored vulnerability objects (filtered + sorted)
 */
export function exportCSV(rows) {
  const lines = [
    CSV_HEADERS.map(escapeField).join(','),
    ...rows.map((v) =>
      [
        v.cveId,
        v.title,
        v.cvssScore,
        v.assetCriticality,
        v.internetFacing ? 'Yes' : 'No',
        v.exploitability,
        v.daysSinceDiscovery,
        v.affectedAssetCount,
        v.compositeScore,
        v.riskTier.tier,
        formatDate(v.dateAdded),
      ]
        .map(escapeField)
        .join(',')
    ),
  ];

  const csv = '\uFEFF' + lines.join('\r\n'); // BOM for Excel compatibility
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `vuln-prioritization-export-${todayISO()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── PDF export (browser print) ───────────────────────────────────────────────

const WEIGHT_LABELS = {
  criticality:   'Asset Criticality',
  cvss:          'CVSS v3 Base Score',
  assetCount:    'Affected Asset Count',
  exposure:      'Internet Exposure',
  exploitability: 'Exploitability',
  epss:          'EPSS Score',
  days:          'Days Since Discovery',
};

/** Row background / accent colours matching the app's risk tier palette. */
const TIER_STYLE = {
  Critical: { bg: '#fee2e2', border: '#f87171', text: '#991b1b' },
  High:     { bg: '#fed7aa', border: '#fb923c', text: '#9a3412' },
  Medium:   { bg: '#fef9c3', border: '#facc15', text: '#854d0e' },
  Low:      { bg: '#dcfce7', border: '#4ade80', text: '#166534' },
};

/**
 * Open a print-ready HTML document in a new tab and trigger the browser's
 * native print / Save-as-PDF dialog.
 *
 * @param {object[]} rows    - Scored vulnerability objects (filtered + sorted)
 * @param {object}   weights - Integer weight map { criticality, assetCount, … }
 */
export function exportPDF(rows, weights) {
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const weightsHTML = Object.entries(weights)
    .map(
      ([key, val]) => `
        <tr>
          <td>${WEIGHT_LABELS[key] ?? key}</td>
          <td class="num">${val}%</td>
        </tr>`
    )
    .join('');

  const rowsHTML = rows
    .map((v, i) => {
      const s = TIER_STYLE[v.riskTier.tier] ?? {};
      return `
        <tr style="background:${s.bg};border-left:3px solid ${s.border}">
          <td class="rank">${i + 1}</td>
          <td class="mono">${htmlEscape(v.cveId)}</td>
          <td class="title">${htmlEscape(v.title)}</td>
          <td class="num">${Number(v.cvssScore).toFixed(1)}</td>
          <td>${htmlEscape(v.assetCriticality)}</td>
          <td>${v.internetFacing ? 'Yes' : 'No'}</td>
          <td>${htmlEscape(v.exploitability)}</td>
          <td class="num">${Number(v.daysSinceDiscovery)}</td>
          <td class="num">${Number(v.affectedAssetCount).toLocaleString()}</td>
          <td class="num bold">${Number(v.compositeScore)}</td>
          <td class="bold" style="color:${s.text}">${htmlEscape(v.riskTier.tier)}</td>
          <td>${htmlEscape(formatDate(v.dateAdded))}</td>
        </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Vulnerability Report — ${todayISO()}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, Arial, sans-serif;
      font-size: 11px;
      color: #111;
      padding: 24px;
    }
    .header { margin-bottom: 20px; }
    .header h1 { font-size: 17px; font-weight: 700; color: #1e40af; margin-bottom: 2px; }
    .header .meta { font-size: 10px; color: #6b7280; }
    h2 {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #1e40af;
      margin: 18px 0 6px;
      padding-bottom: 3px;
      border-bottom: 1px solid #bfdbfe;
    }
    table { border-collapse: collapse; width: 100%; }
    th {
      text-align: left;
      padding: 5px 6px;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #475569;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      white-space: nowrap;
    }
    td {
      padding: 4px 6px;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: middle;
    }
    .num  { text-align: right; white-space: nowrap; }
    .rank { text-align: center; color: #9ca3af; font-size: 9px; }
    .mono { font-family: monospace; font-size: 10px; color: #1d4ed8; }
    .title { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bold { font-weight: 700; }
    .weights-table { width: auto; min-width: 280px; }
    .weights-table td { padding: 3px 8px; }
    .summary { font-size: 10px; color: #6b7280; margin: 4px 0 8px; }
    @media print {
      body { padding: 0; }
      @page { margin: 1.5cm; size: A4 landscape; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>&#x1F6E1;&#xFE0F; Vulnerability Prioritization Report</h1>
    <p class="meta">Generated: ${date} &nbsp;&bull;&nbsp; ${rows.length} ${rows.length === 1 ? 'vulnerability' : 'vulnerabilities'} shown &nbsp;&bull;&nbsp; Reflects current filters and sort order</p>
  </div>

  <h2>Score Weight Configuration</h2>
  <table class="weights-table">
    <thead><tr><th>Factor</th><th style="text-align:right">Weight</th></tr></thead>
    <tbody>${weightsHTML}</tbody>
  </table>

  <h2>Vulnerability Results</h2>
  <p class="summary">Sorted and filtered as displayed at time of export.</p>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>CVE ID</th>
        <th>Title</th>
        <th style="text-align:right">CVSS</th>
        <th>Criticality</th>
        <th>Internet</th>
        <th>Exploitability</th>
        <th style="text-align:right">Age</th>
        <th style="text-align:right">Assets</th>
        <th style="text-align:right">Score</th>
        <th>Tier</th>
        <th>Date Added</th>
      </tr>
    </thead>
    <tbody>${rowsHTML}</tbody>
  </table>

  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=1100,height=750');
  if (!win) {
    alert(
      'Pop-up blocked.\n\nPlease allow pop-ups for this page and try again. ' +
        'The PDF export opens a print preview in a new window.'
    );
    return;
  }
  win.document.write(html);
  win.document.close();
}
