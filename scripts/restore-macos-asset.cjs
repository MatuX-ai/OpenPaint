// Download macOS CI artifact, extract .dmg, upload to release 380975134
const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'MatuX-ai/OpenPaint';
const NEW_ID = 380975134;
const ARTIFACT_ID = 9797956852;
const HEADERS = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${TOKEN}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'openpaint-publish-release-body/1.0',
};

function download(url, dest, redirectCount) {
  redirectCount = redirectCount || 0;
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('too many redirects'));
    const req = https.get(url, { headers: HEADERS }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const next = res.headers.location;
        res.resume();
        return resolve(download(next, dest, redirectCount + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(180000, () => req.destroy(new Error('timeout')));
  });
}

function upload(releaseId, filePath, fileName) {
  return new Promise((resolve, reject) => {
    const fileBuf = fs.readFileSync(filePath);
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
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      }
    );
    req.on('error', reject);
    req.setTimeout(180000, () => req.destroy(new Error('timeout')));
    req.write(fileBuf);
    req.end();
  });
}

(async () => {
  const TMP = '.audit-logs/assets-download';
  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

  // 1. Download zip
  const zipPath = path.join(TMP, 'openpaint-macos.zip');
  console.log(`[1] Downloading macOS artifact ${ARTIFACT_ID} ...`);
  await download(`https://api.github.com/repos/${REPO}/actions/artifacts/${ARTIFACT_ID}/zip`, zipPath);
  console.log(`    OK ${fs.statSync(zipPath).size} bytes`);

  // 2. Extract zip using PowerShell's Expand-Archive
  const extractDir = path.join(TMP, 'macos-extracted');
  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
  fs.mkdirSync(extractDir, { recursive: true });
  console.log(`[2] Extracting zip to ${extractDir} ...`);
  try {
    execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, { stdio: 'inherit' });
  } catch (e) {
    console.log(`    Expand-Archive failed: ${e.message}`);
    return;
  }
  const files = execSync(`powershell -NoProfile -Command "Get-ChildItem -Recurse '${extractDir}' | Select-Object -ExpandProperty FullName"`, { encoding: 'utf8' });
  console.log(`    Extracted files:`);
  files.split('\n').filter(Boolean).forEach((f) => console.log(`      ${f}`));

  // 3. Find .dmg and upload
  const dmgFiles = files.split('\n').filter((f) => f.trim().endsWith('.dmg'));
  if (dmgFiles.length === 0) {
    console.log(`[X] No .dmg found in artifact`);
    return;
  }

  for (const dmg of dmgFiles) {
    const dmgName = path.basename(dmg.trim());
    process.stdout.write(`[3] Uploading ${dmgName} ... `);
    const sz = fs.statSync(dmg.trim()).size;
    console.log(`(${sz} bytes)`);
    const r = await upload(NEW_ID, dmg.trim(), dmgName);
    if (r.status === 201) {
      const j = JSON.parse(r.body);
      console.log(`    [OK] ${j.browser_download_url}`);
    } else {
      console.log(`    [X] HTTP ${r.status} ${r.body.slice(0, 300)}`);
    }
  }

  console.log(`\n[done]`);
})().catch((e) => console.error(`Fatal: ${e.message}\n${e.stack}`));