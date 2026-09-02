// GET /releases/tags/v0.1.4 + also list all releases by tag (page 1+2)
const https = require('https');
const TOKEN = process.env.GITHUB_TOKEN;
const HEADERS = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${TOKEN}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'openpaint/1.0',
};

function get(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'api.github.com', path, method: 'GET', headers: HEADERS },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      }
    );
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

(async () => {
  console.log('[A] GET /releases/tags/v0.1.4');
  let r = await get('/repos/MatuX-ai/OpenPaint/releases/tags/v0.1.4');
  console.log(`    HTTP ${r.status}`);
  if (r.status === 200) {
    const j = JSON.parse(r.body);
    console.log(JSON.stringify({
      id: j.id,
      tag_name: j.tag_name,
      name: j.name,
      draft: j.draft,
      body_length: (j.body || '').length,
      body_first_300: (j.body || '').slice(0, 300),
      url: j.html_url,
    }, null, 2));
  } else {
    console.log('    Body: ' + r.body.slice(0, 300));
  }

  console.log('\n[B] GET /releases?per_page=10&page=1');
  r = await get('/repos/MatuX-ai/OpenPaint/releases?per_page=10&page=1');
  console.log(`    HTTP ${r.status}`);
  if (r.status === 200) {
    const arr = JSON.parse(r.body);
    arr.forEach((rel) => {
      console.log(`    id=${rel.id} | tag_name="${rel.tag_name}" | name="${rel.name}" | draft=${rel.draft} | body_len=${(rel.body||'').length} | url=${rel.html_url}`);
    });
  }
})();