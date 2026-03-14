import { useEffect, useRef } from 'react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status) {
  switch (status) {
    case 'Open':           return 'bg-blue-100 text-blue-800';
    case 'In Progress':    return 'bg-yellow-100 text-yellow-800';
    case 'Remediated':     return 'bg-green-100 text-green-800';
    case 'Accepted Risk':  return 'bg-purple-100 text-purple-800';
    case 'False Positive': return 'bg-gray-100 text-gray-700';
    case 'Risk Re-opened': return 'bg-orange-100 text-orange-800';
    default:               return 'bg-gray-100 text-gray-700';
  }
}

function tierColor(tier) {
  switch (tier) {
    case 'Critical': return 'bg-red-100 text-red-800';
    case 'High':     return 'bg-orange-100 text-orange-800';
    case 'Medium':   return 'bg-yellow-100 text-yellow-900';
    case 'Low':      return 'bg-green-100 text-green-800';
    default:         return 'bg-gray-100 text-gray-700';
  }
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return null; }
}

function SpinnerSm() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ─── DuplicateCveModal ────────────────────────────────────────────────────────

/**
 * Modal dialog shown when a duplicate CVE ID is detected on form submission.
 *
 * isClosed=false → two options: Cancel | Submit Anyway
 * isClosed=true  → three options: Reopen Existing | Submit as New | Cancel
 *
 * Not dismissible by clicking the backdrop — this is a decision point.
 */
export default function DuplicateCveModal({
  duplicate,
  isClosed,
  onCancel,
  onSubmitAnyway,
  onReopenExisting,
  orgUsers = [],
  isReopening = false,
}) {
  const dialogRef    = useRef(null);
  const firstBtnRef  = useRef(null);

  // Focus first action button on mount; trap Tab within the modal; Escape → cancel
  useEffect(() => {
    firstBtnRef.current?.focus();

    function handleKeyDown(e) {
      if (e.key === 'Escape') { onCancel(); return; }
      if (e.key !== 'Tab') return;
      const el = dialogRef.current;
      if (!el) return;
      const focusable = Array.from(
        el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      ).filter((node) => !node.disabled);
      if (!focusable.length) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const cveId   = duplicate.cveId ?? '';
  const status  = duplicate.status ?? 'Open';
  const tier    = typeof duplicate.riskTier === 'object'
    ? (duplicate.riskTier?.tier ?? '')
    : (duplicate.riskTier ?? '');
  const dateStr = duplicate.dateAdded ?? null;
  const assignedUser = orgUsers.find((u) => u.id === duplicate.assigned_to);

  return (
    // Backdrop — NOT clickable (explicit decision required)
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dup-modal-title"
    >
      <div ref={dialogRef} className="w-full max-w-md rounded-xl bg-white shadow-xl ring-1 ring-black/10">

        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
              className="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" clipRule="evenodd" />
            </svg>
            <h2 id="dup-modal-title" className="text-base font-semibold text-gray-900">
              Duplicate CVE Detected
            </h2>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-gray-700">
            {isClosed ? (
              <>
                <span className="font-mono font-medium">{cveId}</span> was previously tracked
                and is currently marked as <span className="font-medium">{status}</span>. How would
                you like to proceed?
              </>
            ) : (
              <>
                <span className="font-mono font-medium">{cveId}</span> is already being tracked
                with status <span className="font-medium">{status}</span>. Are you sure you want to
                create another entry?
              </>
            )}
          </p>

          {/* Existing record summary */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-gray-600">{cveId}</span>
              {status && (
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(status)}`}>
                  {status}
                </span>
              )}
              {tier && (
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tierColor(tier)}`}>
                  {tier}
                </span>
              )}
            </div>
            {dateStr && (
              <p className="text-xs text-gray-500">Added: {formatDisplayDate(dateStr)}</p>
            )}
            {assignedUser && (
              <p className="text-xs text-gray-500">Assigned to: {assignedUser.email}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-gray-100 px-6 py-4">
          {isClosed ? (
            <div className="space-y-2">
              {/* Primary: Reopen */}
              <button
                ref={firstBtnRef}
                type="button"
                onClick={onReopenExisting}
                disabled={isReopening}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              >
                {isReopening && <SpinnerSm />}
                Reopen Existing Record
              </button>
              <p className="text-center text-xs text-gray-500">
                Recommended — changes status to <span className="font-medium">Risk Re-opened</span>
              </p>
              {/* Secondary: Submit as New */}
              <button
                type="button"
                onClick={onSubmitAnyway}
                className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Submit as New
              </button>
              {/* Cancel */}
              <button
                type="button"
                onClick={onCancel}
                className="w-full rounded-md px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex justify-end gap-3">
              <button
                ref={firstBtnRef}
                type="button"
                onClick={onCancel}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSubmitAnyway}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                Submit Anyway
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
