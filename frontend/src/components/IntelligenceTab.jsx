import { useState, useEffect, useMemo, useRef } from 'react';
import { fetchRssFeedContent, updateRssFeed } from '../lib/api.js';
import { parseRssFeed, sortArticles } from '../utils/rssParser.js';
import { formatDate } from '../utils/exportUtils.js';
import ArticleDetailPanel from './ArticleDetailPanel.jsx';

const STALE_MS = 24 * 60 * 60 * 1000;

function isStale(lastFetched) {
  return !lastFetched || Date.now() - new Date(lastFetched).getTime() > STALE_MS;
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function ArticleCard({ article, onClick }) {
  const dateStr = article.pubDate ? formatDate(article.pubDate) : null;
  const desc    = truncate(stripHtml(article.description));

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <span className="text-sm font-medium text-gray-800 leading-snug">{article.title}</span>
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
 * Intelligence tab — unified RSS feed reader.
 *
 * @param {{ feeds: object[], onFeedUpdated: (feedId: string, updates: object) => void }} props
 */
export default function IntelligenceTab({ feeds, onFeedUpdated }) {
  // { [feedId]: 'loading' | 'ok' | 'error' }
  const [statuses,      setStatuses]      = useState({});
  // { [feedId]: article[] }  — keyed so individual feeds can be re-fetched
  const [articlesByFeed, setArticlesByFeed] = useState({});
  const [selectedArticle, setSelectedArticle] = useState(null);

  const autoFetchedRef = useRef(false);

  // Sorted, merged article list derived from articlesByFeed
  const allArticles = useMemo(
    () => sortArticles(Object.values(articlesByFeed).flat()),
    [articlesByFeed]
  );

  // Auto-refresh stale feeds once, when the feeds list first becomes available
  useEffect(() => {
    if (!feeds.length || autoFetchedRef.current) return;
    autoFetchedRef.current = true;
    const stale = feeds.filter((f) => f.enabled && isStale(f.lastFetched));
    if (stale.length) doFetchFeeds(stale);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeds]);

  async function doFetchFeeds(feedsToFetch) {
    // Mark all as loading first
    setStatuses((prev) => {
      const next = { ...prev };
      feedsToFetch.forEach((f) => { next[f.id] = 'loading'; });
      return next;
    });

    await Promise.all(
      feedsToFetch.map(async (feed) => {
        const result = await fetchRssFeedContent(feed.url);
        const now    = new Date().toISOString();

        if (result.error) {
          setStatuses((prev) => ({ ...prev, [feed.id]: 'error' }));
          setArticlesByFeed((prev) => ({ ...prev, [feed.id]: [] }));
          try {
            await updateRssFeed(feed.id, { lastFetched: now, lastFetchedStatus: 'error' });
            onFeedUpdated(feed.id, { lastFetched: now, lastFetchedStatus: 'error' });
          } catch { /* non-critical */ }
          return;
        }

        const parsed = parseRssFeed(result.xml, feed.name);
        if (parsed.error) {
          setStatuses((prev) => ({ ...prev, [feed.id]: 'error' }));
          setArticlesByFeed((prev) => ({ ...prev, [feed.id]: [] }));
          try {
            await updateRssFeed(feed.id, { lastFetched: now, lastFetchedStatus: 'error' });
            onFeedUpdated(feed.id, { lastFetched: now, lastFetchedStatus: 'error' });
          } catch { /* non-critical */ }
          return;
        }

        const items = parsed.items.map((item) => ({ ...item, feedId: feed.id }));
        setStatuses((prev) => ({ ...prev, [feed.id]: 'ok' }));
        setArticlesByFeed((prev) => ({ ...prev, [feed.id]: items }));
        try {
          await updateRssFeed(feed.id, { lastFetched: now, lastFetchedStatus: 'ok' });
          onFeedUpdated(feed.id, { lastFetched: now, lastFetchedStatus: 'ok' });
        } catch { /* non-critical */ }
      })
    );
  }

  function handleRefresh() {
    const enabled = feeds.filter((f) => f.enabled);
    if (enabled.length) doFetchFeeds(enabled);
  }

  // ── Derived display state ─────────────────────────────────────────────────

  const enabledFeeds  = feeds.filter((f) => f.enabled);
  const loadingFeeds  = enabledFeeds.filter((f) => statuses[f.id] === 'loading');
  const erroredFeeds  = enabledFeeds.filter((f) => statuses[f.id] === 'error');
  const anyLoading    = loadingFeeds.length > 0;
  const hasFetched    = enabledFeeds.some((f) => statuses[f.id] !== undefined);
  const allErrored    = hasFetched && enabledFeeds.length > 0 &&
                        erroredFeeds.length === enabledFeeds.length;

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
          onClick={handleRefresh}
          disabled={anyLoading}
          className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5
                     text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {anyLoading && <Spinner className="h-3 w-3" />}
          {anyLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Loading indicators ── */}
      {anyLoading && (
        <div className="mb-4 rounded-md bg-blue-50 border border-blue-100 px-4 py-2.5 text-xs text-blue-700 flex items-center gap-2">
          <Spinner className="h-3 w-3" />
          Fetching: {loadingFeeds.map((f) => f.name).join(', ')}…
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

      {/* ── Empty / error states ── */}
      {allArticles.length === 0 && !anyLoading && (
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
      {allArticles.length > 0 && (
        <div className="space-y-3">
          {allArticles.map((article, i) => (
            <ArticleCard
              key={`${article.feedId}-${i}`}
              article={article}
              onClick={() => setSelectedArticle(article)}
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
