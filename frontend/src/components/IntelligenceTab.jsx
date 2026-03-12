import { useState } from 'react';
import { formatDate } from '../utils/exportUtils.js';
import ArticleDetailPanel from './ArticleDetailPanel.jsx';

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function stripHtml(str) {
  if (!str) return null;
  try {
    const doc = new DOMParser().parseFromString(str, 'text/html');
    return doc.body.textContent ?? null;
  } catch {
    return str.replace(/<[^>]*>/g, '');
  }
}

function truncate(str, max = 200) {
  if (!str) return null;
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function ArticleCard({ article, onClick, isRead }) {
  const dateStr = article.pubDate ? formatDate(article.pubDate) : null;
  const desc    = truncate(stripHtml(article.description));

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border bg-white p-4 transition-colors
        ${isRead
          ? 'border-gray-100 opacity-60 hover:opacity-80'
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }`}
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <span className={`text-sm leading-snug ${isRead ? 'font-normal text-gray-600' : 'font-medium text-gray-800'}`}>
          {article.title}
        </span>
        {dateStr && dateStr !== '-' && (
          <span className="shrink-0 text-xs text-gray-400 mt-0.5">{dateStr}</span>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-1.5">{article.feedName}</p>
      {desc && <p className="text-xs text-gray-600 leading-relaxed">{desc}</p>}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Intelligence tab — displays pre-fetched RSS articles from App.jsx state.
 * All article fetching and lifecycle management lives in App.jsx.
 *
 * @param {{
 *   feeds: object[],
 *   articles: object[],
 *   feedsLoading: boolean,
 *   feedErrors: object,
 *   onRefresh: () => void,
 *   userId: string,
 *   readArticleUrls: Set<string>,
 *   onArticleRead: (url: string) => void,
 * }} props
 */
export default function IntelligenceTab({
  feeds           = [],
  articles        = [],
  feedsLoading    = false,
  feedErrors      = {},
  onRefresh,
  readArticleUrls = new Set(),
  onArticleRead,
}) {
  const [selectedArticle, setSelectedArticle] = useState(null);

  const enabledFeeds = feeds.filter((f) => f.enabled);
  const erroredFeeds = feeds.filter((f) => feedErrors[f.id]);
  const allErrored   = articles.length === 0 && !feedsLoading &&
                       enabledFeeds.length > 0 &&
                       enabledFeeds.every((f) => feedErrors[f.id]);

  function handleArticleClick(article) {
    if (article.link) onArticleRead?.(article.link);
    setSelectedArticle(article);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Intelligence Feed</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Aggregated from {enabledFeeds.length} enabled source{enabledFeeds.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={feedsLoading}
          className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5
                     text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {feedsLoading && <Spinner className="h-3 w-3" />}
          {feedsLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Loading banner ── */}
      {feedsLoading && (
        <div className="mb-4 rounded-md bg-blue-50 border border-blue-100 px-4 py-2.5 text-xs text-blue-700 flex items-center gap-2">
          <Spinner className="h-3 w-3" />
          Fetching feeds…
        </div>
      )}

      {/* ── Per-feed errors (inline warning, non-blocking) ── */}
      {erroredFeeds.length > 0 && !allErrored && (
        <div className="mb-4 space-y-1">
          {erroredFeeds.map((f) => (
            <div key={f.id}
              className="rounded-md bg-amber-50 border border-amber-200 px-4 py-2 text-xs text-amber-700">
              Could not load feed: <span className="font-medium">{f.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty / all-error states ── */}
      {articles.length === 0 && !feedsLoading && (
        allErrored ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-10 text-center">
            <p className="text-sm text-red-700 font-medium">Unable to fetch feeds.</p>
            <p className="text-xs text-red-600 mt-1">
              Check your connection or verify feed URLs in Settings.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
            <p className="text-sm text-gray-500">
              No articles loaded. Click <span className="font-medium">Refresh</span> to fetch the latest intelligence.
            </p>
          </div>
        )
      )}

      {/* ── Article list ── */}
      {articles.length > 0 && (
        <div className="space-y-3">
          {articles.map((article, i) => (
            <ArticleCard
              key={`${article.feedId ?? ''}-${i}`}
              article={article}
              onClick={() => handleArticleClick(article)}
              isRead={article.link ? readArticleUrls.has(article.link) : false}
            />
          ))}
        </div>
      )}

      {selectedArticle && (
        <ArticleDetailPanel
          article={selectedArticle}
          onClose={() => setSelectedArticle(null)}
        />
      )}
    </main>
  );
}
