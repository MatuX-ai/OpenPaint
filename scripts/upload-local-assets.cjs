// Upload local Windows assets to new release id=380975134
const https = require('https');
const fs = require('fs');
const TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'MatuX-ai/OpenPaint';
const NEW_ID = 380975134;

const HEADERS = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${TOKEN}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'openpaint-publish-release-body/1.0',
};

function uploadAsset(releaseId, filePath, fileName) {
  return new Promise((resolve, reject) => {
    const fileBuf = fs.readFileSync(filePath);
    const uploadUrl = `https://uploads.github.com/repos/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(fileName)}`;
    const req = https.request(
      {
        hostname: 'uploads.github.com',
        path: `/repos/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(fileName)}`,
        method: 'POST',
        headers: {
          ...HEADERS,
          'Content-Type': 'application/octet-stream',
          'Content-Length': fileBuf.length,
        },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          resolve({ status: res.statusCode, body: d });
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('timeout')));
    req.write(fileBuf);
    req.end();
  });
}

(async () => {
  console.log(`[init] Uploading to release ${NEW_ID}`);

  const targets = [
    { local: 'src-tauri/target/release/bundle/msi/OpenPaint_0.1.4_x64_en-US.msi', name: 'OpenPaint_0.1.4_x64_en-US.msi' },
    { local: 'src-tauri/target/release/bundle/nsis/OpenPaint_0.1.4_x64-setup.exe', name: 'OpenPaint_0.1.4_x64-setup.exe' },
  ];

  for (const t of targets) {
    if (!fs.existsSync(t.local)) {
      console.log(`[SKIP] ${t.local} not found`);
      continue;
    }
    process.stdout.write(`Uploading ${t.name} ... `);
    const sz = fs.statSync(t.local).size;
    console.log(`(${sz} bytes)`);
    const r = await uploadAsset(NEW_ID, t.local, t.name);
    if (r.status === 201) {
      const j = JSON.parse(r.body);
      console.log(`  [OK] ${j.browser_download_url}`);
    } else {
      console.log(`  [X] HTTP ${r.status} ${r.body.slice(0, 300)}`);
    }
  }
  console.log('\n[done]');
})().catch((e) => console.error(`Fatal: ${e.message}`));