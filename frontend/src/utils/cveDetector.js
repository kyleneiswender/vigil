/**
 * CVE auto-detection utilities.
 *
 * extractCveIds  — extract unique CVE IDs from plain text or HTML strings
 * injectCveActions — inject clickable "Track" badges into sanitized HTML
 */

/**
 * Extract unique CVE IDs from any text string.
 * Returns uppercased IDs in order of first appearance.
 *
 * @param {string|null|undefined} text
 * @returns {string[]}
 */
export function extractCveIds(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(/CVE-\d{4}-\d{4,}/gi);
  if (!matches) return [];
  const seen   = new Set();
  const result = [];
  for (const m of matches) {
    const upper = m.toUpperCase();
    if (!seen.has(upper)) {
      seen.add(upper);
      result.push(upper);
    }
  }
  return result;
}

/**
 * Inject clickable "Track" badges next to CVE IDs found in sanitized HTML.
 *
 * Uses DOMParser to walk only text nodes — CVE IDs in HTML attribute values
 * (e.g. href="…CVE-2021-44228…") are left completely untouched.
 *
 * Each CVE mention becomes:
 *   <span class="cve-mention">
 *     CVE-XXXX-YYYY
 *     &nbsp;<button data-cve-id="CVE-XXXX-YYYY" class="cve-badge [cve-badge--tracked]">
 *       Track | Tracked ✓
 *     </button>
 *   </span>
 *
 * @param {string}   safeHtml        Already-sanitized HTML string
 * @param {string[]} trackedCveIds   Uppercased CVE IDs already in the tracker
 * @returns {string}                 Modified HTML
 */
export function injectCveActions(safeHtml, trackedCveIds = []) {
  if (!safeHtml) return safeHtml;
  const tracked = new Set(trackedCveIds.map((id) => id.toUpperCase()));
  const doc     = new DOMParser().parseFromString(safeHtml, 'text/html');

  function walkTextNodes(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (!/CVE-\d{4}-\d{4,}/i.test(text)) return;

      const frag  = document.createDocumentFragment();
      const re    = /CVE-\d{4}-\d{4,}/gi;
      let   last  = 0;
      let   match;

      while ((match = re.exec(text)) !== null) {
        const cveRaw    = match[0];
        const cveId     = cveRaw.toUpperCase();
        const isTracked = tracked.has(cveId);

        // Text before this match
        if (match.index > last) {
          frag.appendChild(document.createTextNode(text.slice(last, match.index)));
        }

        // Build badge
        const btn = document.createElement('button');
        btn.type      = 'button';
        btn.dataset.cveId = cveId;
        btn.className = isTracked ? 'cve-badge cve-badge--tracked' : 'cve-badge';
        btn.textContent = isTracked ? 'Tracked \u2713' : 'Track';
        if (isTracked) btn.disabled = true;

        // Wrap CVE text + badge in a single inline span
        const wrapper = document.createElement('span');
        wrapper.className = 'cve-mention';
        wrapper.appendChild(document.createTextNode(cveRaw));
        wrapper.appendChild(document.createTextNode('\u00a0'));
        wrapper.appendChild(btn);

        frag.appendChild(wrapper);
        last = match.index + cveRaw.length;
      }

      // Remaining text after the last match
      if (last < text.length) {
        frag.appendChild(document.createTextNode(text.slice(last)));
      }

      node.replaceWith(frag);

    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style') return;
      [...node.childNodes].forEach(walkTextNodes);
    }
  }

  [...doc.body.childNodes].forEach(walkTextNodes);
  return doc.body.innerHTML;
}
