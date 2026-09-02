// Diagnostic script: query release endpoints to find correct one
const https = require('https');

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('[X] GITHUB_TOKEN env var required');
  process.exit(1);
}

const HEADERS = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${TOKEN}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'openpaint-publish-release-body/1.0',
};

function get(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'api.github.com', path, method: 'GET', headers: HEADERS },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  console.log('[1] GET /repos/MatuX-ai/OpenPaint/releases/tags/v0.1.4');
  let r = await get('/repos/MatuX-ai/OpenPaint/releases/tags/v0.1.4');
  console.log(`    HTTP ${r.status}`);
  if (r.status === 200) {
    const parsed = JSON.parse(r.body);
    console.log(`    id: ${parsed.id} | draft: ${parsed.draft} | tag: ${parsed.tag_name}`);
    console.log(`    body length: ${(parsed.body || '').length}`);
    console.log(`    url: ${parsed.html_url}`);
  } else {
    console.log('    ' + r.body.slice(0, 200));
  }

  console.log('\n[2] GET /repos/MatuX-ai/OpenPaint/releases (latest)');
  r = await get('/repos/MatuX-ai/OpenPaint/releases?per_page=3');
  console.log(`    HTTP ${r.status}`);
  if (r.status === 200) {
    const arr = JSON.parse(r.body);
    arr.forEach((rel) => {
      console.log(`    id: ${rel.id} | tag: ${rel.tag_name} | draft: ${rel.draft} | prerelease: ${rel.prerelease} | name: ${rel.name}`);
    });
  } else {
    console.log('    ' + r.body.slice(0, 200));
  }
})();