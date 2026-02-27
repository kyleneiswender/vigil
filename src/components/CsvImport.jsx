import { useState, useRef } from 'react';
import { parseCSV, INTERNAL_FIELDS, autoDetectMapping, applyMapping } from '../utils/csvParser';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
  'text/comma-separated-values',
];

// ─── Step constants ───────────────────────────────────────────────────────────

const STEP = {
  IDLE: 'idle',
  PREVIEW: 'preview',
  VALIDATE: 'validate',
  DONE: 'done',
};

// ─── Shared style tokens ──────────────────────────────────────────────────────

const selectClass =
  'w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const btnPrimary =
  'rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors';
const btnSecondary =
  'rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors';

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Multi-step CSV import flow.
 * Steps: idle → preview+mapping → validation summary → done.
 *
 * @param {{ onImport: (records: object[]) => void }} props
 */
export default function CsvImport({ onImport }) {
  const [step, setStep] = useState(STEP.IDLE);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [parsedData, setParsedData] = useState(null);   // { headers, rows }
  const [mapping, setMapping] = useState({});            // { fieldKey: colIndex | null }
  const [validationResult, setValidationResult] = useState(null); // { valid, invalid }
  const [importCount, setImportCount] = useState(0);

  const fileInputRef = useRef(null);

  // ── File ingestion ──────────────────────────────────────────────────────────

  async function processFile(file) {
    setParseError(null);
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setParseError('Only .csv files are accepted.');
      return;
    }

    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
      setParseError('Invalid file type. Please upload a valid CSV file.');
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setParseError(
        `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 10 MB.`
      );
      return;
    }

    try {
      const text = await file.text();
      const data = parseCSV(text);

      if (data.headers.length === 0) {
        setParseError('The file appears to be empty or has no header row.');
        return;
      }
      if (data.rows.length === 0) {
        setParseError('No data rows found. The file only contains a header row.');
        return;
      }

      setParsedData(data);
      setMapping(autoDetectMapping(data.headers));
      setStep(STEP.PREVIEW);
    } catch {
      setParseError('Failed to read the file. Ensure it is a valid UTF-8 CSV.');
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    processFile(e.dataTransfer.files[0]);
  }

  function handleFileInput(e) {
    processFile(e.target.files[0]);
  }

  // ── Step transitions ────────────────────────────────────────────────────────

  function handleConfirmMapping() {
    const result = applyMapping(parsedData.rows, parsedData.headers, mapping);
    setValidationResult(result);
    setStep(STEP.VALIDATE);
  }

  function handleFinalImport() {
    onImport(validationResult.valid);
    setImportCount(validationResult.valid.length);
    setStep(STEP.DONE);
  }

  function reset() {
    setStep(STEP.IDLE);
    setParsedData(null);
    setMapping({});
    setValidationResult(null);
    setParseError(null);
    setImportCount(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">CSV Import</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Bulk-import vulnerabilities from a CSV export (Qualys, Tenable, etc.)
        </p>
      </div>

      <div className="px-6 py-5">
        {step === STEP.IDLE && (
          <DropZone
            isDragging={isDragging}
            setIsDragging={setIsDragging}
            onDrop={handleDrop}
            onFileInput={handleFileInput}
            fileInputRef={fileInputRef}
            parseError={parseError}
          />
        )}

        {step === STEP.PREVIEW && (
          <PreviewAndMapping
            parsedData={parsedData}
            mapping={mapping}
            setMapping={setMapping}
            onConfirm={handleConfirmMapping}
            onCancel={reset}
          />
        )}

        {step === STEP.VALIDATE && (
          <ValidationSummary
            result={validationResult}
            onImport={handleFinalImport}
            onBack={() => setStep(STEP.PREVIEW)}
            onCancel={reset}
          />
        )}

        {step === STEP.DONE && (
          <SuccessMessage count={importCount} onReset={reset} />
        )}
      </div>
    </div>
  );
}

// ─── Step: Idle / Drop zone ───────────────────────────────────────────────────

function DropZone({ isDragging, setIsDragging, onDrop, onFileInput, fileInputRef, parseError }) {
  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          isDragging
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100'
        }`}
      >
        {/* Upload icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-10 w-10 ${isDragging ? 'text-blue-400' : 'text-gray-400'}`}
        >
          <path d="M12 16V4m0 0-3 3m3-3 3 3" />
          <path d="M20 16.5A3.5 3.5 0 0 0 16.5 13H15a5 5 0 1 0-9.9 1A4 4 0 0 0 5 22h14a3 3 0 0 0 1-5.5" />
        </svg>

        <p className={`mt-3 text-sm font-medium ${isDragging ? 'text-blue-600' : 'text-gray-700'}`}>
          {isDragging ? 'Drop your CSV file here' : 'Drag & drop a CSV file here'}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">or</p>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
          className="mt-2 rounded-md border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
        >
          Choose File
        </button>

        <p className="mt-3 text-xs text-gray-400">Accepts: .csv</p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={onFileInput}
          className="hidden"
        />
      </div>

      {parseError && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
            <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" clipRule="evenodd" />
          </svg>
          {parseError}
        </p>
      )}
    </div>
  );
}

// ─── Step: Preview + field mapping ───────────────────────────────────────────

function PreviewAndMapping({ parsedData, mapping, setMapping, onConfirm, onCancel }) {
  const { headers, rows } = parsedData;
  const previewRows = rows.slice(0, 5);

  function handleMappingChange(fieldKey, value) {
    setMapping((prev) => ({
      ...prev,
      [fieldKey]: value === '' ? null : Number(value),
    }));
  }

  const requiredUnmapped = INTERNAL_FIELDS.filter(
    (f) => f.required && (mapping[f.key] === null || mapping[f.key] === undefined)
  );

  return (
    <div className="space-y-6">
      {/* ── Preview table ── */}
      <div>
        <div className="mb-2 flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-gray-800">CSV Preview</h3>
          <span className="text-xs text-gray-500">
            Showing {previewRows.length} of {rows.length} data {rows.length === 1 ? 'row' : 'rows'}
          </span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50">
              <tr>
                {headers.map((h, i) => (
                  <th
                    key={i}
                    className="whitespace-nowrap px-3 py-2 text-left font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {previewRows.map((row, ri) => (
                <tr key={ri} className="hover:bg-gray-50">
                  {headers.map((_, ci) => (
                    <td key={ci} className="max-w-xs truncate whitespace-nowrap px-3 py-2 text-gray-700">
                      {row[ci] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Field mapping ── */}
      <div>
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-gray-800">Map CSV Columns to Fields</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Required fields are marked <span className="text-red-500 font-medium">*</span>. Optional fields use defaults if unmapped.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {INTERNAL_FIELDS.map((field) => {
            const currentVal =
              mapping[field.key] === null || mapping[field.key] === undefined
                ? ''
                : String(mapping[field.key]);

            const isAutoDetected =
              mapping[field.key] !== null && mapping[field.key] !== undefined;

            return (
              <div key={field.key} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">
                  {field.label}
                  {field.required && <span className="ml-0.5 text-red-500">*</span>}
                  {isAutoDetected && (
                    <span className="ml-1.5 text-[10px] font-normal text-blue-600">auto-detected</span>
                  )}
                </label>
                <select
                  value={currentVal}
                  onChange={(e) => handleMappingChange(field.key, e.target.value)}
                  className={selectClass}
                >
                  <option value="">— Not mapped —</option>
                  {headers.map((h, i) => (
                    <option key={i} value={String(i)}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        {requiredUnmapped.length > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-700">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-amber-500">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" clipRule="evenodd" />
            </svg>
            Required {requiredUnmapped.map((f) => f.label).join(', ')} not mapped — all rows will fail validation.
          </p>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
        <button type="button" onClick={onCancel} className={btnSecondary}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} className={btnPrimary}>
          Validate {rows.length} {rows.length === 1 ? 'Row' : 'Rows'} →
        </button>
      </div>
    </div>
  );
}

// ─── Step: Validation summary ─────────────────────────────────────────────────

const MAX_SHOWN_ERRORS = 10;

function ValidationSummary({ result, onImport, onBack, onCancel }) {
  const { valid, invalid } = result;
  const hiddenErrors = invalid.length - MAX_SHOWN_ERRORS;

  return (
    <div className="space-y-4">
      {/* Summary counts */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143z" clipRule="evenodd" />
            </svg>
          </span>
          <span className="text-sm font-medium text-gray-800">
            <span className="text-green-700 font-semibold">{valid.length}</span>{' '}
            {valid.length === 1 ? 'row' : 'rows'} ready to import
          </span>
        </div>

        {invalid.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-700">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </span>
            <span className="text-sm font-medium text-gray-800">
              <span className="text-red-600 font-semibold">{invalid.length}</span>{' '}
              {invalid.length === 1 ? 'row' : 'rows'} will be skipped (validation errors)
            </span>
          </div>
        )}
      </div>

      {/* Error detail list */}
      {invalid.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Skipped rows
          </h4>
          <ul className="rounded-lg border border-red-100 bg-red-50 divide-y divide-red-100">
            {invalid.slice(0, MAX_SHOWN_ERRORS).map(({ rowNumber, errors }) => (
              <li key={rowNumber} className="flex gap-2 px-3 py-2 text-xs">
                <span className="shrink-0 font-medium text-red-700">Row {rowNumber}</span>
                <span className="text-red-600">{errors.join('; ')}</span>
              </li>
            ))}
            {hiddenErrors > 0 && (
              <li className="px-3 py-2 text-xs text-red-500 italic">
                …and {hiddenErrors} more skipped {hiddenErrors === 1 ? 'row' : 'rows'}
              </li>
            )}
          </ul>
        </div>
      )}

      {valid.length === 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No importable rows were found. All rows have validation errors. Please review your CSV or fix the column mapping.
        </p>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
        <button type="button" onClick={onCancel} className={btnSecondary}>
          Cancel
        </button>
        <button type="button" onClick={onBack} className={btnSecondary}>
          ← Back to Mapping
        </button>
        {valid.length > 0 && (
          <button type="button" onClick={onImport} className={btnPrimary}>
            Import {valid.length} {valid.length === 1 ? 'Record' : 'Records'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Step: Done ───────────────────────────────────────────────────────────────

function SuccessMessage({ count, onReset }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-green-600">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143z" clipRule="evenodd" />
          </svg>
        </span>
        <p className="text-sm text-green-800">
          Successfully imported{' '}
          <span className="font-semibold">{count}</span>{' '}
          {count === 1 ? 'record' : 'records'}. They have been added to the queue below and saved.
        </p>
      </div>
      <button type="button" onClick={onReset} className={btnSecondary + ' shrink-0'}>
        Import Another File
      </button>
    </div>
  );
}
