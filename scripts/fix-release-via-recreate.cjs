// Safe cleanup of v0.1.4 dual-release state:
// PHASE 1 (safe): POST a NEW release bound to tag v0.1.4 with full body
//   - if fails: stop, softprops release remains untouched
//   - if success: have new release id, softprops still alive (with assets)
// PHASE 2: Download 3 assets from softprops
// PHASE 3: Upload 3 assets to NEW release
//   - if any upload fails: stop, can retry uploads; softprops release still safe
// PHASE 4: DELETE softprops release (only after new release is complete with assets)

const https = require('https');
const fs = require('fs');
const path = require('path');
const TOKEN = process.env.GITHUB_TOKEN;
const TAG = 'v0.1.4';
const REPO = 'MatuX-ai/OpenPaint';
const OLD_ID = 380432194;
const BODY_FILE = `docs/releases/${TAG}.md`;
const TMP = '.audit-logs/assets-download';

const HEADERS = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${TOKEN}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'openpaint-publish-release-body/1.0',
};

function httpReq(method, path, payload, extraHeaders) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path,
      method,
      headers: { ...HEADERS, ...(extraHeaders || {}) },
    };
    let body = null;
    if (payload) {
      if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
        opts.headers['Content-Type'] = 'application/octet-stream';
        opts.headers['Content-Length'] = Buffer.byteLength(payload);
        body = payload;
      } else {
        const json = JSON.stringify(payload);
        opts.headers['Content-Type'] = 'application/json';
        opts.headers['Content-Length'] = Buffer.byteLength(json);
        body = json;
      }
    }
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('timeout')));
    if (body) req.write(body);
    req.end();
  });
}

function downloadTo(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.destroy();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    });
    req.on('error', (err) => {
      file.destroy();
      reject(err);
    });
    req.setTimeout(120000, () => req.destroy(new Error('download timeout')));
  });
}

async function phase(label, fn) {
  console.log(`\n=== ${label} ===`);
  return await fn();
}

(async () => {
  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });
  const body = fs.readFileSync(BODY_FILE, 'utf8');
  console.log(`[init] Body: ${body.length} chars | TMP: ${TMP}`);

  // === PHASE 1: POST new release bound to v0.1.4 ===
  let newRelease;
  try {
    newRelease = await phase('PHASE 1: POST new release bound to v0.1.4', async () => {
      const payload = {
        tag_name: TAG,
        target_commitish: 'main',
        name: TAG,
        body: body,
        draft: true,
        prerelease: false,
      };
      const r = await httpReq('POST', `/repos/${REPO}/releases`, payload);
      console.log(`  HTTP ${r.status}`);
      if (r.status !== 201) {
        console.log(`  [X] ${r.body.slice(0, 500)}`);
        throw new Error('Create failed - aborting. Softprops release safe.');
      }
      const j = JSON.parse(r.body);
      console.log(`  [OK] id=${j.id} | tag=${j.tag_name} | url=${j.html_url}`);
      return j;
    });
  } catch (e) {
    console.error(e.message);
    return;
  }

  // === PHASE 2: Get softprops release assets ===
  const softpropsAssets = await phase('PHASE 2: Read softprops release assets', async () => {
    const r = await httpReq('GET', `/repos/${REPO}/releases/${OLD_ID}`);
    if (r.status !== 200) {
      console.log(`  [X] HTTP ${r.status}`);
      return [];
    }
    const j = JSON.parse(r.body);
    console.log(`  softprops release: tag=${j.tag_name} | draft=${j.draft} | assets=${j.assets.length}`);
    j.assets.forEach((a) => console.log(`    - ${a.name} (${(a.size/1024/1024).toFixed(2)} MB)`));
    return j.assets;
  });

  if (softpropsAssets.length === 0) {
    console.log('\n[!] No assets to migrate. New release stays empty.');
  }

  // === PHASE 3: Download assets ===
  const downloaded = await phase('PHASE 3: Download assets', async () => {
    const out = [];
    for (const a of softpropsAssets) {
      const dest = path.join(TMP, a.name);
      process.stdout.write(`  ${a.name} ... `);
      try {
        await downloadTo(a.browser_download_url, dest);
        const sz = fs.statSync(dest).size;
        console.log(`OK (${(sz/1024/1024).toFixed(2)} MB)`);
        out.push({ name: a.name, path: dest, size: sz });
      } catch (e) {
        console.log(`FAILED: ${e.message}`);
      }
    }
    console.log(`  [OK] ${out.length}/${softpropsAssets.length} downloaded`);
    return out;
  });

  // === PHASE 4: Upload assets to new release ===
  await phase('PHASE 4: Upload assets to new release', async () => {
    const uploadUrl = newRelease.upload_url.replace(/{.*$/, '');
    let ok = 0;
    for (const a of downloaded) {
      process.stdout.write(`  ${a.name} ... `);
      const fileBuf = fs.readFileSync(a.path);
      const uploadPath = `${uploadUrl}/releases/${newRelease.id}/assets?name=${encodeURIComponent(a.name)}`;
      const r = await httpReq('POST', uploadPath, fileBuf, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileBuf.length,
      });
      if (r.status === 201) {
        console.log('OK');
        ok++;
      } else {
        console.log(`FAILED: HTTP ${r.status} ${r.body.slice(0, 200)}`);
      }
    }
    console.log(`  [OK] ${ok}/${downloaded.length} uploaded`);
    if (ok !== downloaded.length) {
      console.log(`  [!] Not all assets uploaded. Skipping delete of softprops release.`);
      throw new Error('Partial upload');
    }
  }).catch((e) => console.log(`  ${e.message}`));

  // === PHASE 5: Verify new release, then DELETE old ===
  const verified = await phase('PHASE 5: Verify + DELETE old', async () => {
    const r = await httpReq('GET', `/repos/${REPO}/releases/${newRelease.id}`);
    if (r.status !== 200) {
      console.log(`  [X] Cannot verify new release (HTTP ${r.status})`);
      return false;
    }
    const j = JSON.parse(r.body);
    console.log(`  new release: tag=${j.tag_name} | draft=${j.draft} | body=${j.body.length} chars | assets=${j.assets.length}`);
    if (j.assets.length < downloaded.length) {
      console.log(`  [!] New release has ${j.assets.length} assets but we downloaded ${downloaded.length}. Aborting delete.`);
      return false;
    }
    console.log(`  DELETE softprops release id=${OLD_ID} ...`);
    const dr = await httpReq('DELETE', `/repos/${REPO}/releases/${OLD_ID}`);
    console.log(`  HTTP ${dr.status}`);
    return dr.status === 204;
  });

  if (verified) {
    console.log('\n=== ✅ SUCCESS ===');
    console.log(`New release: https://github.com/${REPO}/releases/tag/${TAG}`);
    console.log(`Draft=true. Click "Publish" in web UI to release.`);
  } else {
    console.log('\n=== ⚠️ PARTIAL SUCCESS ===');
    console.log('New release exists but old softprops was NOT deleted. Manual cleanup may be needed.');
    console.log(`New release: https://github.com/${REPO}/releases/tag/${TAG}`);
  }
})().catch((e) => console.error(`[X] Fatal: ${e.message}\n${e.stack}`));