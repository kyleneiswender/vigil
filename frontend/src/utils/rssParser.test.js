// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  parseRssFeed, sortArticles,
  filterArticlesByAge, capArticles, deduplicateArticles,
  MAX_ARTICLES_PER_FEED, MAX_ARTICLES_TOTAL,
} from './rssParser.js';

// ─── Fixture XML strings ──────────────────────────────────────────────────────

const RSS_VALID = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Item One</title>
      <link>https://example.com/1</link>
      <description>First item description</description>
      <pubDate>Mon, 10 Mar 2025 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Item Two</title>
      <link>https://example.com/2</link>
      <description>Second item description</description>
      <pubDate>Tue, 11 Mar 2025 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_VALID = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>Atom Entry One</title>
    <link href="https://example.com/atom/1"/>
    <summary>Summary of atom entry one</summary>
    <updated>2025-03-10T12:00:00Z</updated>
  </entry>
  <entry>
    <title>Atom Entry Two</title>
    <link href="https://example.com/atom/2"/>
    <content>Content of atom entry two</content>
    <published>2025-03-09T08:00:00Z</published>
  </entry>
</feed>`;

const XML_MALFORMED = `<this is not valid xml <<<>>>`;

const RSS_EMPTY = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Empty Feed</title>
  </channel>
</rss>`;

const RSS_MISSING_FIELDS = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <description>Only a description, no title/link/date</description>
    </item>
  </channel>
</rss>`;

// ─── parseRssFeed ─────────────────────────────────────────────────────────────

describe('parseRssFeed', () => {
  it('R1: parses valid RSS 2.0 — returns correct items with all fields', () => {
    const result = parseRssFeed(RSS_VALID, 'My Feed');
    expect(result.error).toBeUndefined();
    expect(result.items).toHaveLength(2);

    const first = result.items[0];
    expect(first.title).toBe('Item One');
    expect(first.link).toBe('https://example.com/1');
    expect(first.description).toBe('First item description');
    expect(first.pubDate).toMatch(/Mon, 10 Mar 2025/);
    expect(first.feedName).toBe('My Feed');
  });

  it('R2: parses valid Atom — uses link href, summary/content, updated/published', () => {
    const result = parseRssFeed(ATOM_VALID, 'Atom Source');
    expect(result.error).toBeUndefined();
    expect(result.items).toHaveLength(2);

    const first = result.items[0];
    expect(first.title).toBe('Atom Entry One');
    expect(first.link).toBe('https://example.com/atom/1');
    expect(first.description).toBe('Summary of atom entry one');
    expect(first.pubDate).toBe('2025-03-10T12:00:00Z');
    expect(first.feedName).toBe('Atom Source');
  });

  it('R3: Atom entry with content and published — fullContent populated, description null', () => {
    const result = parseRssFeed(ATOM_VALID, 'Atom Source');
    const second = result.items[1];
    expect(second.fullContent).toBe('Content of atom entry two');
    expect(second.description).toBeNull();
    expect(second.pubDate).toBe('2025-03-09T08:00:00Z');
  });

  it('R4: returns { error: "parse_error", items: [] } for malformed XML', () => {
    const result = parseRssFeed(XML_MALFORMED, 'Bad Feed');
    expect(result.error).toBe('parse_error');
    expect(result.items).toEqual([]);
  });

  it('R5: returns { error: "unknown_format", items: [] } for XML with no items or entries', () => {
    const result = parseRssFeed(RSS_EMPTY, 'Empty Feed');
    expect(result.error).toBe('unknown_format');
    expect(result.items).toEqual([]);
  });

  it('R6: handles missing title, link, and pubDate gracefully — uses fallbacks', () => {
    const result = parseRssFeed(RSS_MISSING_FIELDS, 'Sparse Feed');
    expect(result.error).toBeUndefined();
    expect(result.items).toHaveLength(1);

    const item = result.items[0];
    expect(item.title).toBe('Untitled');
    expect(item.link).toBeNull();
    expect(item.pubDate).toBeNull();
    expect(item.description).toBe('Only a description, no title/link/date');
  });

  it('R7: attaches feedName to every item', () => {
    const result = parseRssFeed(RSS_VALID, 'Named Feed');
    expect(result.items.every((i) => i.feedName === 'Named Feed')).toBe(true);
  });
});

// ─── sortArticles ─────────────────────────────────────────────────────────────

describe('sortArticles', () => {
  it('S1: sorts valid dates newest-first', () => {
    const articles = [
      { title: 'Old',  pubDate: '2023-01-01T00:00:00Z' },
      { title: 'New',  pubDate: '2025-03-10T00:00:00Z' },
      { title: 'Mid',  pubDate: '2024-06-15T00:00:00Z' },
    ];
    const sorted = sortArticles(articles);
    expect(sorted[0].title).toBe('New');
    expect(sorted[1].title).toBe('Mid');
    expect(sorted[2].title).toBe('Old');
  });

  it('S2: places articles with invalid dates after those with valid dates', () => {
    const articles = [
      { title: 'Bad Date', pubDate: 'not-a-date' },
      { title: 'Valid',    pubDate: '2025-03-10T00:00:00Z' },
      { title: 'No Date',  pubDate: null },
    ];
    const sorted = sortArticles(articles);
    expect(sorted[0].title).toBe('Valid');
    // Bad Date and No Date come after, in any order
    const bottomTitles = sorted.slice(1).map((a) => a.title);
    expect(bottomTitles).toContain('Bad Date');
    expect(bottomTitles).toContain('No Date');
  });

  it('S3: handles all invalid dates without throwing', () => {
    const articles = [
      { title: 'A', pubDate: 'garbage' },
      { title: 'B', pubDate: null },
      { title: 'C', pubDate: undefined },
    ];
    const sorted = sortArticles(articles);
    expect(sorted).toHaveLength(3);
    // No error thrown; all items present
    const titles = sorted.map((a) => a.title);
    expect(titles).toContain('A');
    expect(titles).toContain('B');
    expect(titles).toContain('C');
  });

  it('S4: does not mutate the original array', () => {
    const articles = [
      { title: 'B', pubDate: '2023-01-01T00:00:00Z' },
      { title: 'A', pubDate: '2025-01-01T00:00:00Z' },
    ];
    const original = [...articles];
    sortArticles(articles);
    expect(articles[0].title).toBe(original[0].title);
    expect(articles[1].title).toBe(original[1].title);
  });

  it('S5: returns empty array for empty input', () => {
    expect(sortArticles([])).toEqual([]);
  });
});

// ─── filterArticlesByAge ───────────────────────────────────────────────────────

describe('filterArticlesByAge', () => {
  it('A1: keeps article published within 30 days', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const articles = [{ title: 'Recent', pubDate: yesterday.toISOString() }];
    expect(filterArticlesByAge(articles)).toHaveLength(1);
  });

  it('A2: removes article published more than 30 days ago', () => {
    const old = new Date();
    old.setDate(old.getDate() - 31);
    const articles = [{ title: 'Old', pubDate: old.toISOString() }];
    expect(filterArticlesByAge(articles)).toHaveLength(0);
  });

  it('A3: keeps article with null pubDate', () => {
    const articles = [{ title: 'No date', pubDate: null }];
    expect(filterArticlesByAge(articles)).toHaveLength(1);
  });

  it('A4: keeps article with unparseable pubDate', () => {
    const articles = [{ title: 'Bad date', pubDate: 'not-a-date' }];
    expect(filterArticlesByAge(articles)).toHaveLength(1);
  });

  it('A5: keeps article published 29 days ago (within the 30-day window)', () => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    const articles = [{ title: '29 days old', pubDate: d.toISOString() }];
    expect(filterArticlesByAge(articles)).toHaveLength(1);
  });

  it('A6: returns empty array for empty input', () => {
    expect(filterArticlesByAge([])).toEqual([]);
  });
});

// ─── capArticles ───────────────────────────────────────────────────────────────

describe('capArticles', () => {
  it('B1: enforces per-feed cap at MAX_ARTICLES_PER_FEED', () => {
    const articles = Array.from({ length: 60 }, (_, i) => ({
      feedName: 'Feed A',
      title: `Article ${i}`,
    }));
    const result = capArticles(articles);
    expect(result).toHaveLength(MAX_ARTICLES_PER_FEED);
    expect(result.every(a => a.feedName === 'Feed A')).toBe(true);
  });

  it('B2: enforces total cap at MAX_ARTICLES_TOTAL across many feeds', () => {
    // 11 feeds × 50 articles = 550 input items (all pass per-feed cap individually)
    const articles = [];
    for (let feed = 0; feed < 11; feed++) {
      for (let i = 0; i < 50; i++) {
        articles.push({ feedName: `Feed ${feed}`, title: `Article ${i}` });
      }
    }
    const result = capArticles(articles);
    expect(result).toHaveLength(MAX_ARTICLES_TOTAL);
  });

  it('B3: mixed feeds — per-feed cap and total cap applied correctly', () => {
    // Feed A: 60 articles (cap to 50), Feed B: 10 articles (kept all)
    const feedA = Array.from({ length: 60 }, (_, i) => ({ feedName: 'A', title: `A${i}` }));
    const feedB = Array.from({ length: 10 }, (_, i) => ({ feedName: 'B', title: `B${i}` }));
    const result = capArticles([...feedA, ...feedB]);
    expect(result).toHaveLength(60); // 50 from A + 10 from B
    expect(result.filter(a => a.feedName === 'A')).toHaveLength(MAX_ARTICLES_PER_FEED);
    expect(result.filter(a => a.feedName === 'B')).toHaveLength(10);
  });
});

// ─── deduplicateArticles ───────────────────────────────────────────────────────

describe('deduplicateArticles', () => {
  it('C1: removes duplicate URLs, keeping first occurrence', () => {
    const articles = [
      { title: 'First',  link: 'https://example.com/a' },
      { title: 'Dupe',   link: 'https://example.com/a' },
      { title: 'Second', link: 'https://example.com/b' },
    ];
    const result = deduplicateArticles(articles);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('First');
    expect(result[1].title).toBe('Second');
  });

  it('C2: keeps articles without a link (no dedup key)', () => {
    const articles = [
      { title: 'No link A', link: null },
      { title: 'No link B', link: null },
    ];
    expect(deduplicateArticles(articles)).toHaveLength(2);
  });

  it('C3: first occurrence wins when URLs match', () => {
    const articles = [
      { title: 'Original', link: 'https://example.com/x' },
      { title: 'Duplicate', link: 'https://example.com/x' },
    ];
    const result = deduplicateArticles(articles);
    expect(result[0].title).toBe('Original');
  });
});

// ─── Pipeline order ────────────────────────────────────────────────────────────

describe('article pipeline', () => {
  it('D1: age filter applied before cap — old articles do not consume the cap budget', () => {
    const recentDate = new Date().toISOString();
    const oldDate    = '2000-01-01T00:00:00Z';

    // 51 recent + 10 old for one feed
    const recent = Array.from({ length: 51 }, (_, i) => ({
      feedName: 'Feed', pubDate: recentDate, link: `https://example.com/new/${i}`,
    }));
    const old = Array.from({ length: 10 }, (_, i) => ({
      feedName: 'Feed', pubDate: oldDate, link: `https://example.com/old/${i}`,
    }));

    // Filter first: old articles removed, 51 recent remain
    const filtered = filterArticlesByAge([...recent, ...old]);
    expect(filtered).toHaveLength(51);
    expect(filtered.some(a => a.pubDate === oldDate)).toBe(false);

    // Cap after filter: per-feed limit of 50 applied to the 51 recent
    const capped = capArticles(filtered);
    expect(capped).toHaveLength(MAX_ARTICLES_PER_FEED);
    expect(capped.every(a => a.pubDate === recentDate)).toBe(true);
  });
});
