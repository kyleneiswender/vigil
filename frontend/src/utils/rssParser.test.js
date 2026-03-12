// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseRssFeed, sortArticles } from './rssParser.js';

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
