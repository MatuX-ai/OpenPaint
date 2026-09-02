// List ALL releases including drafts
const https = require('https');
const TOKEN = process.env.GITHUB_TOKEN;

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
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

(async () => {
  console.log('[A] /repos/.../releases (default, published + draft)');
  let r = await get('/repos/MatuX-ai/OpenPaint/releases?per_page=10');
  console.log(`    HTTP ${r.status}`);
  let arr = JSON.parse(r.body);
  arr.forEach((rel) => {
    console.log(`    id=${rel.id} | tag_name="${rel.tag_name}" | name="${rel.name}" | draft=${rel.draft} | url=${rel.html_url}`);
    console.log(`       body chars: ${(rel.body || '').length}`);
    console.log(`       target: ${rel.target_commitish}`);
    console.log(`       created_at: ${rel.created_at} | published_at: ${rel.published_at}`);
  });

  console.log('\n[B] /repos/.../releases?draft=true (some versions expose this)');
  r = await get('/repos/MatuX-ai/OpenPaint/releases?per_page=10&page=2');
  if (r.status === 200) {
    const arr2 = JSON.parse(r.body);
    if (arr2.length) {
      console.log(`    Page 2:`);
      arr2.forEach((rel) => {
        console.log(`    id=${rel.id} | tag_name="${rel.tag_name}" | name="${rel.name}" | draft=${rel.draft}`);
      });
    } else {
      console.log('    (empty)');
    }
  }
})();