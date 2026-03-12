/**
 * rssParser.js — browser-native RSS 2.0 / Atom parser.
 *
 * Uses the browser's built-in DOMParser; no external dependencies.
 * All exported functions are pure and side-effect-free.
 */

/**
 * Sanitize an HTML string for safe rendering via dangerouslySetInnerHTML.
 *
 * Removes executable elements (script, iframe, form, etc.) and strips all
 * event-handler attributes (on*) and javascript:/data: URL schemes.
 * Opens all links in a new tab with noopener for safety.
 *
 * @param {string} html - Raw HTML string (e.g. from content:encoded or description)
 * @returns {string} Safe HTML with only presentational markup remaining
 */
export function sanitizeHtml(html) {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Remove elements that can execute code or cause unwanted behaviour
    doc.querySelectorAll(
      'script, style, iframe, object, embed, form, base, meta, link'
    ).forEach((el) => el.remove());

    doc.querySelectorAll('*').forEach((el) => {
      // Strip event handlers and javascript:/data: URL schemes
      [...el.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const val  = attr.value.trim().toLowerCase();
        if (
          name.startsWith('on') ||
          ((name === 'href' || name === 'src' || name === 'action') &&
            (val.startsWith('javascript:') || val.startsWith('data:')))
        ) {
          el.removeAttribute(attr.name);
        }
      });

      // Force external links to open safely in a new tab
      if (el.tagName === 'A') {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    });

    return doc.body.innerHTML;
  } catch {
    return '';
  }
}

/**
 * Parse a raw XML string into a list of article objects.
 *
 * Handles RSS 2.0 (<item> elements) and Atom (<entry> elements).
 * Captures content:encoded (full HTML article body) when present.
 * Returns { items } on success or { error, items: [] } on failure.
 *
 * @param {string} xml       - Raw XML string from the RSS proxy
 * @param {string} feedName  - Display name of the feed (attached to every item)
 * @returns {{ items: object[] } | { error: string, items: [] }}
 */
export function parseRssFeed(xml, feedName) {
  try {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(xml, 'application/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) return { error: 'parse_error', items: [] };

    // ── RSS 2.0 ──────────────────────────────────────────────────────────────
    const rssItems = doc.querySelectorAll('item');
    if (rssItems.length > 0) {
      return {
        items: Array.from(rssItems).map((item) => {
          // content:encoded is a namespaced extension — getElementsByTagName
          // with prefix works in XML-parsed documents.
          const fullContent =
            item.getElementsByTagName('content:encoded')[0]?.textContent?.trim() ?? null;

          return {
            title:       item.querySelector('title')?.textContent?.trim()        ?? 'Untitled',
            link:        item.querySelector('link')?.textContent?.trim()         ?? null,
            description: item.querySelector('description')?.textContent?.trim() ?? null,
            pubDate:     item.querySelector('pubDate')?.textContent?.trim()      ?? null,
            fullContent,
            feedName,
          };
        }),
      };
    }

    // ── Atom ─────────────────────────────────────────────────────────────────
    const atomEntries = doc.querySelectorAll('entry');
    if (atomEntries.length > 0) {
      return {
        items: Array.from(atomEntries).map((entry) => {
          // Atom <content> often holds full HTML; <summary> is the excerpt.
          const contentEl = entry.querySelector('content');
          const fullContent = contentEl?.textContent?.trim() ?? null;

          return {
            title:       entry.querySelector('title')?.textContent?.trim()              ?? 'Untitled',
            link:        entry.querySelector('link')?.getAttribute('href')              ?? null,
            description: entry.querySelector('summary')?.textContent?.trim()           ?? null,
            pubDate:     entry.querySelector('updated, published')?.textContent?.trim() ?? null,
            fullContent,
            feedName,
          };
        }),
      };
    }

    return { error: 'unknown_format', items: [] };
  } catch {
    return { error: 'parse_error', items: [] };
  }
}

/**
 * Sort an array of article objects by publication date, descending.
 * Articles with unparseable or missing dates are placed at the bottom.
 *
 * @param {object[]} articles
 * @returns {object[]} new sorted array (original is not mutated)
 */
export function sortArticles(articles) {
  return [...articles].sort((a, b) => {
    const ta = a.pubDate ? new Date(a.pubDate).getTime() : NaN;
    const tb = b.pubDate ? new Date(b.pubDate).getTime() : NaN;
    const va = !isNaN(ta);
    const vb = !isNaN(tb);
    if (va && vb) return tb - ta;   // both valid — newer first
    if (va)       return -1;        // a valid, b invalid — a comes first
    if (vb)       return 1;         // b valid, a invalid — b comes first
    return 0;                       // both invalid — preserve relative order
  });
}
