// Try downloading macOS artifact with redirect handling
const https = require('https');
const fs = require('fs');
const TOKEN = process.env.GITHUB_TOKEN;
const ARTIFACT_ID = 9797956852;

function download(url, dest, redirectCount) {
  redirectCount = redirectCount || 0;
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('too many redirects'));
    const req = https.get(
      url,
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'openpaint/1.0',
        },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          const next = res.headers.location;
          console.log(`  redirect ${res.statusCode} -> ${next.slice(0, 80)}...`);
          res.resume();
          return resolve(download(next, dest, redirectCount + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      }
    );
    req.on('error', reject);
    req.setTimeout(180000, () => req.destroy(new Error('timeout')));
  });
}

const TMP = '.audit-logs/assets-download';
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });
const dest = `${TMP}/macos-attempt.zip`;
fs.rmSync(dest, { force: true });

(async () => {
  console.log(`Trying https://api.github.com/repos/MatuX-ai/OpenPaint/actions/artifacts/${ARTIFACT_ID}/zip`);
  try {
    await download(`https://api.github.com/repos/MatuX-ai/OpenPaint/actions/artifacts/${ARTIFACT_ID}/zip`, dest);
    console.log(`OK: ${fs.statSync(dest).size} bytes`);
  } catch (e) {
    console.log(`FAIL: ${e.message}`);
    console.log(`Trying with api.github.com (vnd.github.v3+json)...`);
    try {
      await download(`https://api.github.com/repos/MatuX-ai/OpenPaint/actions/artifacts/${ARTIFACT_ID}/zip`, dest);
      console.log(`OK: ${fs.statSync(dest).size} bytes`);
    } catch (e2) {
      console.log(`FAIL: ${e2.message}`);
    }
  }
})();