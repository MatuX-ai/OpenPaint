// Try various endpoints to find which release the web page is reading
const https = require('https');
const TOKEN = process.env.GITHUB_TOKEN;
const HEADERS = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${TOKEN}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'openpaint/1.0',
};

function get(p) {
  return new Promise((res, rej) => {
    const r = https.request(
      { hostname: 'api.github.com', path: p, method: 'GET', headers: HEADERS },
      (rs) => {
        let d = '';
        rs.on('data', (c) => (d += c));
        rs.on('end', () => res({ status: rs.statusCode, body: d }));
      }
    );
    r.on('error', rej);
    r.end();
  });
}

(async () => {
  // 1. List all releases including drafts, look for any with name "v0.1.4"
  console.log('[1] GET /repos/.../releases?per_page=30');
  let r = await get('/repos/MatuX-ai/OpenPaint/releases?per_page=30');
  console.log(`    HTTP ${r.status}`);
  if (r.status === 200) {
    const arr = JSON.parse(r.body);
    arr.forEach((rel) => {
      console.log(`    id=${rel.id} | tag_name="${rel.tag_name}" | name="${rel.name}" | draft=${rel.draft}`);
      console.log(`       target: ${rel.target_commitish}`);
      console.log(`       created: ${rel.created_at} | updated: ${rel.updated_at}`);
      console.log(`       body_len: ${(rel.body||'').length} | body_first_60: ${(rel.body||'').slice(0,60).replace(/\n/g,'\\n')}`);
    });
  }

  // 2. Try GET /releases/latest
  console.log('\n[2] GET /repos/.../releases/latest');
  r = await get('/repos/MatuX-ai/OpenPaint/releases/latest');
  console.log(`    HTTP ${r.status}`);
  if (r.status === 200) {
    const j = JSON.parse(r.body);
    console.log(`    id=${j.id} | tag_name="${j.tag_name}" | name="${j.name}" | draft=${j.draft}`);
    console.log(`    body_first_60: ${(j.body||'').slice(0,60).replace(/\n/g,'\\n')}`);
  } else {
    console.log(`    ${r.body.slice(0, 200)}`);
  }
})();