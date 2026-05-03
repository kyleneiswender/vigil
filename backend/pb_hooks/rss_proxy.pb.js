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

  // SSRF guard — block private/loopback targets.
  // Inline to avoid goja module-scope function accessibility issues.
  var _s = String(url).toLowerCase();
  var _ssrfBlocked = false;
  if (_s.indexOf('http://') !== 0 && _s.indexOf('https://') !== 0) {
    _ssrfBlocked = true;
  } else {
    var _afterProto = _s.indexOf('://') + 3;
    var _rest = _s.slice(_afterProto);
    var _end = _rest.length;
    var _sl = _rest.indexOf('/'); if (_sl !== -1 && _sl < _end) _end = _sl;
    var _q  = _rest.indexOf('?'); if (_q  !== -1 && _q  < _end) _end = _q;
    var _h  = _rest.indexOf('#'); if (_h  !== -1 && _h  < _end) _end = _h;
    var _hwp = _rest.slice(0, _end);
    var _cp  = _hwp.indexOf(':');
    var _host = _cp !== -1 ? _hwp.slice(0, _cp) : _hwp;
    if (!_host ||
        _host === 'localhost' || _host === '::1' ||
        _host.indexOf('127.')     === 0 ||
        _host.indexOf('10.')      === 0 ||
        _host.indexOf('192.168.') === 0 ||
        _host.indexOf('169.254.') === 0) {
      _ssrfBlocked = true;
    } else if (_host.indexOf('172.') === 0) {
      var _parts  = _host.split('.');
      var _second = parseInt(_parts[1], 10);
      if (_second >= 16 && _second <= 31) _ssrfBlocked = true;
    }
  }
  if (_ssrfBlocked) {
    return e.json(400, { error: 'invalid or disallowed url' });
  }

  try {
    const response = $http.send({
      url:    url,
      method: 'GET',
      headers: {
        'User-Agent': 'Vigil/1.0',
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
