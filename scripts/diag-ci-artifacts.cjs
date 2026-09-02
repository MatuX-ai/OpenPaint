// List CI artifacts for workflow run 33501159525
const https = require('https');
const TOKEN = process.env.GITHUB_TOKEN;
const HEADERS = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${TOKEN}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'openpaint/1.0',
};

const r = https.request(
  {
    hostname: 'api.github.com',
    path: '/repos/MatuX-ai/OpenPaint/actions/runs/33501159525/artifacts',
    method: 'GET',
    headers: HEADERS,
  },
  (res) => {
    let d = '';
    res.on('data', (c) => (d += c));
    res.on('end', () => {
      console.log(`HTTP ${res.statusCode}`);
      if (res.statusCode === 200) {
        const j = JSON.parse(d);
        console.log(`total: ${j.total_count}`);
        j.artifacts.forEach((a) => {
          console.log(`  id=${a.id} name=${a.name} size=${a.size} expired=${a.expired}`);
          console.log(`    url=${a.archive_download_url}`);
        });
      } else {
        console.log(d);
      }
    });
  }
);
r.on('error', console.error);
r.end();