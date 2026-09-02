// PATCH release 380432194 to bind tag_name = v0.1.4 and publish
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
  // Step 1: PATCH to bind tag_name = v0.1.4
  console.log('[1] PATCH /releases/380432194 → tag_name=v0.1.4');
  const payload = JSON.stringify({ tag_name: 'v0.1.4' });
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
    }, null, 2));
  } else {
    console.log('    Body: ' + r.body.slice(0, 500));
  }

  // Step 2: Verify by listing again
  console.log('\n[2] Verify via GET /releases?per_page=10');
  const r2 = await httpReq('GET', '/repos/MatuX-ai/OpenPaint/releases?per_page=10');
  console.log(`    HTTP ${r2.status}`);
  if (r2.status === 200) {
    const arr = JSON.parse(r2.body);
    arr.forEach((rel) => {
      console.log(`    id=${rel.id} | tag_name="${rel.tag_name}" | name="${rel.name}" | draft=${rel.draft} | body_len=${(rel.body||'').length} | url=${rel.html_url}`);
    });
  }

  // Step 3: Also verify GET /releases/tags/v0.1.4 now works
  console.log('\n[3] Verify via GET /releases/tags/v0.1.4');
  const r3 = await httpReq('GET', '/repos/MatuX-ai/OpenPaint/releases/tags/v0.1.4');
  console.log(`    HTTP ${r3.status}`);
  if (r3.status === 200) {
    const j = JSON.parse(r3.body);
    console.log(JSON.stringify({
      id: j.id,
      tag_name: j.tag_name,
      name: j.name,
      url: j.html_url,
      body_length: (j.body || '').length,
    }, null, 2));
  } else {
    console.log('    Body: ' + r3.body.slice(0, 500));
  }
})();