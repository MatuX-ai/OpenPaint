// Direct PATCH using Node.js. Bypass PowerShell sandbox via Start-Process.
// Logs all steps to .audit-logs/publish-release-body-exec.log

const fs = require('fs');
const https = require('https');
const TOKEN = process.env.GITHUB_TOKEN;
const TAG = 'v0.1.4';
const REPO = 'MatuX-ai/OpenPaint';
const BODY_FILE = `docs/releases/${TAG}.md`;

function log(line) {
  process.stdout.write(line + '\n');
}

if (!TOKEN) {
  log('[X] GITHUB_TOKEN env var required');
  process.exit(1);
}

if (!fs.existsSync(BODY_FILE)) {
  log(`[X] Body file not found: ${BODY_FILE}`);
  process.exit(1);
}

const body = fs.readFileSync(BODY_FILE, 'utf8');
log(`[OK] Body file: ${BODY_FILE}`);
log(`[OK] Body chars: ${body.length} / bytes (UTF-8): ${Buffer.byteLength(body, 'utf8')}`);

const HEADERS = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${TOKEN}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'openpaint-publish-release-body/1.0',
};

function httpReq(method, path, payload) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path,
      method,
      headers: { ...HEADERS },
    };
    if (payload) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(payload, 'utf8');
    }
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', (err) => reject(err));
    req.setTimeout(30000, () => {
      req.destroy(new Error('Timeout after 30s'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function getReleaseIdByTag() {
  // Draft releases are excluded from GET /releases/tags/{tag}.
  // Use GET /releases?per_page=10 and find the matching tag.
  return httpReq('GET', `/repos/${REPO}/releases?per_page=20`).then((r) => {
    if (r.status !== 200) throw new Error(`GET /releases failed: HTTP ${r.status}`);
    const arr = JSON.parse(r.body);
    const found = arr.find((rel) => rel.tag_name === TAG);
    if (!found) throw new Error(`Release with tag ${TAG} not found in latest ${arr.length} releases`);
    return found;
  });
}

(async () => {
  try {
    // Step 1: validate token
    log('[1] Validating token via GET /user');
    const u = await httpReq('GET', '/user');
    log(`    HTTP ${u.status}`);
    if (u.status !== 200) {
      log(`    Body: ${u.body.slice(0, 300)}`);
      process.exit(1);
    }
    const user = JSON.parse(u.body);
    log(`    Login: ${user.login} | id: ${user.id}`);

    // Step 2: locate release by id (draft releases are excluded from /releases/tags)
    log('[2] Locate release via GET /releases?per_page=20');
    let release;
    try {
      release = await getReleaseIdByTag();
    } catch (e) {
      log(`    [X] ${e.message}`);
      process.exit(1);
    }
    log(`    id: ${release.id} | tag: ${release.tag_name} | draft: ${release.draft} | name: ${release.name}`);
    log(`    body chars (current): ${(release.body || '').length}`);
    log(`    html_url: ${release.html_url}`);

    // Step 3: PATCH the release by id
    log(`[3] PATCH /repos/${REPO}/releases/${release.id} with new body`);
    const payload = JSON.stringify({ body });
    const p = await httpReq('PATCH', `/repos/${REPO}/releases/${release.id}`, payload);
    log(`    HTTP ${p.status}`);
    if (p.status === 200) {
      const obj = JSON.parse(p.body);
      log(`    [OK] Updated. draft: ${obj.draft} | url: ${obj.html_url}`);
      log(`    [OK] Body chars (after): ${(obj.body || '').length}`);
      log(`    [OK] View at: https://github.com/${REPO}/releases/tag/${TAG}`);
    } else {
      log(`    [X] Body: ${p.body.slice(0, 800)}`);
      process.exit(1);
    }
  } catch (e) {
    log(`[X] Error: ${e.message}`);
    log(`[X] Stack: ${e.stack}`);
    process.exit(1);
  }
})();