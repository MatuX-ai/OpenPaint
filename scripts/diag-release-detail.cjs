// GET release 380432194 detail and dump fields
const https = require('https');
const TOKEN = process.env.GITHUB_TOKEN;
const HEADERS = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${TOKEN}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'openpaint/1.0',
};

https.request(
  {
    hostname: 'api.github.com',
    path: '/repos/MatuX-ai/OpenPaint/releases/380432194',
    method: 'GET',
    headers: HEADERS,
  },
  (res) => {
    let d = '';
    res.on('data', (c) => (d += c));
    res.on('end', () => {
      const j = JSON.parse(d);
      const out = {
        tag_name: j.tag_name,
        name: j.name,
        target_commitish: j.target_commitish,
        draft: j.draft,
        prerelease: j.prerelease,
        body_length: (j.body || '').length,
        body_first_300: (j.body || '').slice(0, 300),
        body_last_300: (j.body || '').slice(-300),
        url: j.html_url,
        assets: j.assets.map((a) => ({
          name: a.name,
          size: a.size,
          browser_download_url: a.browser_download_url,
        })),
      };
      console.log(JSON.stringify(out, null, 2));
    });
  }
).end();