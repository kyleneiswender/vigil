const getStorageKey = (userId) => `vuln_tool_read_articles_${userId}`;

export function getReadArticles(userId) {
  if (!userId) return new Set();
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

export function markArticleRead(userId, articleUrl) {
  if (!userId || !articleUrl) return;
  try {
    const read = getReadArticles(userId);
    read.add(articleUrl);
    localStorage.setItem(getStorageKey(userId), JSON.stringify([...read]));
  } catch {
    // localStorage unavailable, fail silently
  }
}

export function isArticleRead(userId, articleUrl) {
  if (!userId || !articleUrl) return false;
  return getReadArticles(userId).has(articleUrl);
}

export function pruneReadArticles(userId, activeArticleUrls) {
  if (!userId) return;
  try {
    const read = getReadArticles(userId);
    const active = new Set(activeArticleUrls);
    const pruned = new Set([...read].filter(url => active.has(url)));
    localStorage.setItem(getStorageKey(userId), JSON.stringify([...pruned]));
  } catch {
    // localStorage unavailable, fail silently
  }
}
