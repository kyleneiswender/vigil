import { useState } from 'react';
import { DEFAULT_WEIGHTS, WEIGHT_LABELS, redistributeWeights } from '../utils/scoringEngine';

/**
 * Collapsible panel that lets the user adjust the six scoring factor weights
 * via sliders. Automatically keeps weights summing to 100% using proportional
 * redistribution. Calls onWeightsChange with the new weight map on every change.
 *
 * @param {{ weights: object, onWeightsChange: (w: object) => void }} props
 */
export default function WeightConfig({ weights, onWeightsChange }) {
  const [open, setOpen] = useState(false);

  function handleSlider(key, rawValue) {
    onWeightsChange(redistributeWeights(weights, key, Number(rawValue)));
  }

  function handleReset() {
    onWeightsChange({ ...DEFAULT_WEIGHTS });
  }

  const isDefault = Object.keys(DEFAULT_WEIGHTS).every(
    (k) => weights[k] === DEFAULT_WEIGHTS[k]
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* ── Collapsible header ── */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-gray-900">Risk Lens</span>
          {!isDefault && (
            <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
              customised
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Compact weight summary shown when collapsed */}
          {!open && (
            <span className="hidden text-xs text-gray-400 sm:block">
              {Object.entries(WEIGHT_LABELS)
                .map(([k, label]) => `${label.split(' ')[0]} ${weights[k]}%`)
                .join(' · ')}
            </span>
          )}
          {/* Chevron */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-5 w-5 shrink-0 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          >
            <path
              fillRule="evenodd"
              d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </button>

      {/* ── Expanded body ── */}
      {open && (
        <div className="border-t border-gray-200 px-6 py-5">
          <p className="mb-4 text-xs text-gray-500">
            Adjust each slider to change how much that factor influences the composite score.
            The remaining five sliders are scaled proportionally to keep the total at 100%.
          </p>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(WEIGHT_LABELS).map(([key, label]) => (
              <WeightSlider
                key={key}
                label={label}
                value={weights[key]}
                defaultValue={DEFAULT_WEIGHTS[key]}
                onChange={(v) => handleSlider(key, v)}
              />
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-400">
              Total:{' '}
              <span className="font-semibold text-gray-700">
                {Object.values(weights).reduce((s, v) => s + v, 0)}%
              </span>
            </p>
            <button
              type="button"
              onClick={handleReset}
              disabled={isDefault}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Individual slider ────────────────────────────────────────────────────────

function WeightSlider({ label, value, defaultValue, onChange }) {
  const isModified = value !== defaultValue;

  // Color the filled track to indicate the weight's contribution
  const pct = value; // 0–100
  const trackStyle = {
    background: `linear-gradient(to right, #2563eb ${pct}%, #e5e7eb ${pct}%)`,
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <div className="flex items-center gap-1.5">
          {isModified && (
            <span className="text-[10px] text-blue-500">(was {defaultValue}%)</span>
          )}
          <span className="min-w-[36px] text-right text-sm font-semibold text-blue-700">
            {value}%
          </span>
        </div>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={trackStyle}
        className="h-2 w-full cursor-pointer appearance-none rounded-full focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
      />
    </div>
  );
}
