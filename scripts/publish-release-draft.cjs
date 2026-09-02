// Publish release 380432194 (set draft: false)
const https = require('https');
const TOKEN = process.env.GITHUB_TOKEN;
const HEADERS = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${TOKEN}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'openpaint-publish-release-body/1.0',
};

function httpReq(method, path, payload) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path,
      method,
      headers: { ...HEADERS },
    };
    if (payload) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(payload, 'utf8');
    }
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  console.log('[1] PATCH /releases/380432194 → draft=false');
  const payload = JSON.stringify({ draft: false });
  const r = await httpReq('PATCH', '/repos/MatuX-ai/OpenPaint/releases/380432194', payload);
  console.log(`    HTTP ${r.status}`);
  if (r.status === 200) {
    const j = JSON.parse(r.body);
    console.log(JSON.stringify({
      id: j.id,
      tag_name: j.tag_name,
      name: j.name,
      url: j.html_url,
      body_length: (j.body || '').length,
      draft: j.draft,
      published_at: j.published_at,
      target_commitish: j.target_commitish,
      assets: j.assets.map(a => ({ name: a.name, size: a.size, browser_download_url: a.browser_download_url })),
    }, null, 2));
  } else {
    console.log('    Body: ' + r.body.slice(0, 500));
  }
})();