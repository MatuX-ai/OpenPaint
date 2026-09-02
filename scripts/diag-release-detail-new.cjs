// Final verification of release 380975134
const https = require('https');
const TOKEN = process.env.GITHUB_TOKEN;
const HEADERS = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${TOKEN}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'openpaint/1.0',
};

const req = https.request(
  {
    hostname: 'api.github.com',
    path: '/repos/MatuX-ai/OpenPaint/releases/380975134',
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
        body_first_120: (j.body || '').slice(0, 120),
        body_last_120: (j.body || '').slice(-120),
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
);
req.on('error', console.error);
req.end();