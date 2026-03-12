import { useEffect } from 'react';
import { sanitizeHtml }                  from '../utils/rssParser.js';
import { formatDate }                    from '../utils/exportUtils.js';
import { injectCveActions }              from '../utils/cveDetector.js';

// ─── Scoped typography styles ─────────────────────────────────────────────────
// Applied only inside [data-article-body] so they don't leak to the rest of
// the app. Covers the common HTML elements found in RSS content:encoded payloads.

const ARTICLE_STYLES = `
  [data-article-body] { font-size: 0.875rem; line-height: 1.65; color: #374151; }
  [data-article-body] p  { margin-bottom: 0.8rem; }
  [data-article-body] ul, [data-article-body] ol { margin: 0.4rem 0 0.8rem 1.4rem; }
  [data-article-body] li { margin-bottom: 0.25rem; }
  [data-article-body] h1, [data-article-body] h2, [data-article-body] h3,
  [data-article-body] h4 { font-weight: 600; margin: 1.1rem 0 0.45rem; color: #111827; }
  [data-article-body] h1 { font-size: 1.05rem; }
  [data-article-body] h2 { font-size: 0.975rem; }
  [data-article-body] h3 { font-size: 0.9rem; }
  [data-article-body] a  { color: #2563eb; text-decoration: underline; }
  [data-article-body] a:hover { color: #1d4ed8; }
  [data-article-body] blockquote {
    border-left: 3px solid #d1d5db; margin: 0.75rem 0;
    padding: 0.25rem 0.75rem; color: #6b7280; font-style: italic;
  }
  [data-article-body] pre {
    background: #f3f4f6; border-radius: 0.375rem;
    padding: 0.75rem 1rem; overflow-x: auto; font-size: 0.8rem;
    margin-bottom: 0.8rem;
  }
  [data-article-body] code {
    background: #f3f4f6; border-radius: 0.25rem;
    padding: 0.1rem 0.3rem; font-size: 0.8em;
  }
  [data-article-body] pre code { background: none; padding: 0; }
  [data-article-body] img {
    max-width: 100%; height: auto;
    border-radius: 0.375rem; margin: 0.5rem 0;
  }
  [data-article-body] table {
    width: 100%; border-collapse: collapse;
    font-size: 0.8rem; margin-bottom: 0.8rem;
  }
  [data-article-body] th, [data-article-body] td {
    border: 1px solid #e5e7eb;
    padding: 0.35rem 0.6rem; text-align: left;
  }
  [data-article-body] th { background: #f9fafb; font-weight: 600; }
  [data-article-body] hr {
    border: none; border-top: 1px solid #e5e7eb; margin: 1rem 0;
  }
  [data-article-body] .cve-mention { display: inline; white-space: nowrap; }
  [data-article-body] .cve-badge {
    display: inline-flex; align-items: center; margin-left: 0.2rem;
    padding: 0.05rem 0.35rem; border-radius: 0.25rem;
    font-size: 0.68rem; font-weight: 600; vertical-align: middle;
    background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;
    cursor: pointer; transition: background 0.15s; line-height: 1.4;
  }
  [data-article-body] .cve-badge:hover:not(:disabled) { background: #dbeafe; }
  [data-article-body] .cve-badge--tracked {
    background: #f0fdf4; color: #15803d; border-color: #bbf7d0; cursor: default;
  }
`;

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  );
}

/**
 * Slide-in panel showing the full content of a selected RSS article.
 *
 * Content priority: fullContent (content:encoded / Atom <content>) → description.
 * All HTML is sanitized before rendering.
 *
 * @param {{ article: object, onClose: () => void, trackedCveIds?: string[], onAddCve?: (cveId: string) => void }} props
 */
export default function ArticleDetailPanel({ article, onClose, trackedCveIds = [], onAddCve }) {
  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dateStr    = article.pubDate ? formatDate(article.pubDate) : null;
  const rawHtml    = article.fullContent || article.description || '';
  const safeHtml   = sanitizeHtml(rawHtml);
  const enrichedHtml = injectCveActions(safeHtml, trackedCveIds);
  const hasContent = safeHtml.trim().length > 0;

  function handleBodyClick(e) {
    const btn = e.target.closest('[data-cve-id]');
    if (!btn || btn.disabled) return;
    onAddCve?.(btn.dataset.cveId);
  }

  return (
    <>
      {/* Scoped typography */}
      <style>{ARTICLE_STYLES}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={article.title}
        className="fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-2xl bg-white shadow-2xl"
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4 shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1.5">
              <span className="font-medium text-gray-500">{article.feedName}</span>
              {dateStr && dateStr !== '-' && (
                <><span>·</span><span>{dateStr}</span></>
              )}
            </div>
            <h2 className="text-base font-semibold text-gray-900 leading-snug">
              {article.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close article"
            className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <XIcon />
          </button>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {hasContent ? (
            <div
              data-article-body
              onClick={handleBodyClick}
              dangerouslySetInnerHTML={{ __html: enrichedHtml }}
            />
          ) : (
            <p className="text-sm text-gray-400 italic">
              No content available in this feed item.
            </p>
          )}
        </div>

        {/* ── Footer ── */}
        {article.link && (
          <div className="shrink-0 border-t border-gray-200 px-6 py-3 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {article.fullContent ? 'Full feed content shown above' : 'Excerpt shown — full article at source'}
            </span>
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
            >
              Read original
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                <path fillRule="evenodd" d="M4.22 11.78a.75.75 0 0 1 0-1.06L9.44 5.5H5.75a.75.75 0 0 1 0-1.5h5.5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0V6.56l-5.22 5.22a.75.75 0 0 1-1.06 0Z" clipRule="evenodd" />
              </svg>
            </a>
          </div>
        )}
      </div>
    </>
  );
}
