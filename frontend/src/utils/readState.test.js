// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getReadArticles,
  markArticleRead,
  isArticleRead,
  pruneReadArticles,
} from './readState.js';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('readState', () => {
  it('E1: markArticleRead persists to localStorage and isArticleRead returns true', () => {
    markArticleRead('user1', 'https://example.com/article/1');
    expect(isArticleRead('user1', 'https://example.com/article/1')).toBe(true);
  });

  it('E2: isArticleRead returns false for unread article', () => {
    markArticleRead('user1', 'https://example.com/article/1');
    expect(isArticleRead('user1', 'https://example.com/article/2')).toBe(false);
  });

  it('E2b: read state is per-user — user2 cannot see user1 reads', () => {
    markArticleRead('user1', 'https://example.com/article/1');
    expect(isArticleRead('user2', 'https://example.com/article/1')).toBe(false);
  });

  it('E3: pruneReadArticles removes entries for articles no longer active', () => {
    markArticleRead('user1', 'https://old.com/article');
    markArticleRead('user1', 'https://new.com/article');

    pruneReadArticles('user1', ['https://new.com/article']);

    expect(isArticleRead('user1', 'https://old.com/article')).toBe(false);
    expect(isArticleRead('user1', 'https://new.com/article')).toBe(true);
  });

  it('E3b: pruneReadArticles with empty active list clears all entries', () => {
    markArticleRead('user1', 'https://example.com/a');
    markArticleRead('user1', 'https://example.com/b');
    pruneReadArticles('user1', []);
    expect(isArticleRead('user1', 'https://example.com/a')).toBe(false);
    expect(isArticleRead('user1', 'https://example.com/b')).toBe(false);
  });

  it('E4: markArticleRead is graceful when localStorage.setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    // Should not throw
    expect(() => markArticleRead('user1', 'https://example.com/a')).not.toThrow();
  });

  it('E4b: isArticleRead returns false when localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('unavailable'); });
    expect(isArticleRead('user1', 'https://example.com/a')).toBe(false);
  });

  it('E4c: pruneReadArticles is graceful when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('unavailable'); });
    expect(() => pruneReadArticles('user1', ['https://example.com/a'])).not.toThrow();
  });

  it('E5: getReadArticles returns empty Set for unknown user', () => {
    const result = getReadArticles('nobody');
    expect(result.size).toBe(0);
  });

  it('E5b: markArticleRead and isArticleRead are no-ops for null/empty userId', () => {
    expect(() => markArticleRead(null, 'https://example.com')).not.toThrow();
    expect(isArticleRead(null, 'https://example.com')).toBe(false);
    expect(isArticleRead('', 'https://example.com')).toBe(false);
  });

  it('E5c: markArticleRead is no-op for null/empty articleUrl', () => {
    expect(() => markArticleRead('user1', null)).not.toThrow();
    expect(() => markArticleRead('user1', '')).not.toThrow();
    // Nothing written
    expect(getReadArticles('user1').size).toBe(0);
  });
});
