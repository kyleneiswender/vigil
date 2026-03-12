// rss_proxy.pb.js — PocketBase server-side RSS proxy hook.
//
// Routes GET /api/rss-proxy?url=<encoded-feed-url> to the upstream feed and
// returns the raw XML to the browser, bypassing the browser same-origin policy.
// The hook runs inside the PocketBase JS runtime, which uses $http.send (not
// the browser's fetch()), so CORS does not apply server-side.
//
// Authentication is intentionally NOT required — any valid session can read
// publicly-available RSS feeds, and the hook only allows GET requests.

routerAdd('GET', '/api/rss-proxy', (e) => {
  const url = e.request.url.query().get('url');
  if (!url) {
    return e.json(400, { error: 'url parameter required' });
  }

  try {
    const response = $http.send({
      url:    url,
      method: 'GET',
      headers: {
        'User-Agent': 'VulnPrioritizationTool/1.0',
        'Accept':     'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
      timeout: 10,
    });

    if (response.statusCode !== 200) {
      return e.json(response.statusCode, { error: 'upstream error' });
    }

    e.response.header().set('Content-Type', 'application/xml');
    return e.string(200, response.raw);
  } catch (err) {
    return e.json(500, { error: 'fetch failed' });
  }
});
