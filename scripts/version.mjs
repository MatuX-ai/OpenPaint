#!/usr/bin/env node
// ============================================================
// OpenPaint 版本号管理脚本
// ============================================================
// 单一来源原则：src-tauri/tauri.conf.json 的 "version" 是唯一权威版本。
// 本脚本在修改版本时同步三处：
//   1. src-tauri/tauri.conf.json  (打包产物版本号来源，唯一权威)
//   2. src-tauri/Cargo.toml       (Rust crate 版本)
//   3. src-web/package.json       (前端包版本)
//
// 用法：
//   node scripts/version.mjs                  # 显示当前版本
//   node scripts/version.mjs 0.2.0            # 设置新版本（严格 SemVer，PATCH 不允许前导零）
//   node scripts/version.mjs --bump           # PATCH +1；超过 99 时进位到 MINOR+1，PATCH=0
//   node scripts/version.mjs --check          # 校验三处版本是否一致（CI 用）
//   node scripts/version.mjs --check v0.2.0   # 校验三处版本 + git tag 是否一致
//
// 版本规范：严格 SemVer（MAJOR.MINOR.PATCH[-prerelease][+build]）。
// PATCH 段不允许前导零（SemVer 9.1.2），约定最多两位数字（0-99）。
// --bump 会自动进位：0.1.0 → 0.1.1 → ... → 0.1.99 → 0.2.0。
// ============================================================

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const FILES = {
  tauri: join(root, 'src-tauri', 'tauri.conf.json'),
  cargo: join(root, 'src-tauri', 'Cargo.toml'),
  web: join(root, 'src-web', 'package.json'),
};

// 严格 SemVer：PATCH 段不允许前导零（SemVer §2）。
// --bump 输出 1-2 位数字（无前导零），与 Cargo / Tauri CLI 的解析器一致。
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d{0,1})(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

// PATCH 段最大 99（两位数字上限）；超过时由 --bump 自动进位到 MINOR+1 并重置 PATCH=0。
const PATCH_MAX = 99;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

/** 从 Cargo.toml 读取 [package] version = "x.y.z" */
function readCargoVersion(text) {
  const m = text.match(/^version\s*=\s*"([^"]+)"/m);
  return m ? m[1] : null;
}

/** 替换 Cargo.toml 中 [package] 段的 version 行 */
function setCargoVersion(text, version) {
  return text.replace(
    /^(\s*version\s*=\s*)"[^"]*"/m,
    (_, pre) => `${pre}"${version}"`,
  );
}

function currentVersions() {
  const tauri = readJson(FILES.tauri);
  const cargo = readCargoVersion(readFileSync(FILES.cargo, 'utf8'));
  const web = readJson(FILES.web);
  return {
    tauri: tauri.version,
    cargo,
    web: web.version,
  };
}

function checkConsistency(print = true) {
  const v = currentVersions();
  const unique = new Set([v.tauri, v.cargo, v.web]);
  const ok = unique.size === 1;
  if (print) {
    console.log('当前版本：');
    console.log(`  tauri.conf.json : ${v.tauri}`);
    console.log(`  Cargo.toml      : ${v.cargo}`);
    console.log(`  package.json    : ${v.web}`);
    console.log(ok ? '✅ 三处版本一致' : '❌ 版本不一致！请运行 node scripts/version.mjs <version> 同步');
  }
  return { ok, version: v.tauri, ...v };
}

function setVersion(newVersion) {
  if (!SEMVER_RE.test(newVersion)) {
    console.error(`❌ 非法版本号 "${newVersion}"，须符合严格 SemVer：MAJOR.MINOR.PATCH[-prerelease][+build]（PATCH 1-2 位数字，无前导零）`);
    process.exit(1);
  }

  const tauri = readJson(FILES.tauri);
  tauri.version = newVersion;
  writeJson(FILES.tauri, tauri);

  const cargoText = readFileSync(FILES.cargo, 'utf8');
  writeFileSync(FILES.cargo, setCargoVersion(cargoText, newVersion), 'utf8');

  const web = readJson(FILES.web);
  web.version = newVersion;
  writeJson(FILES.web, web);

  console.log(`✅ 已同步版本 → ${newVersion}`);
  checkConsistency();
}

/**
 * PATCH 段 +1；达到 99 后再次 +1 时进位到 MINOR+1，PATCH 重置为 00。
 * 输出统一以两位零填充（如 0.1.01、0.1.10、0.2.00）。
 * 忽略 SemVer 的 -prerelease / +build 后缀，仅在数字段做递增。
 */
function bumpVersion() {
  const v = currentVersions();
  const match = v.tauri.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    console.error(`❌ 当前版本 "${v.tauri}" 格式异常，无法 bump`);
    process.exit(1);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  let nextMinor = minor;
  let nextPatch = patch + 1;
  if (nextPatch > PATCH_MAX) {
    nextPatch = 0;
    nextMinor += 1;
  }

  const padded = String(nextPatch); // 无前导零（SemVer §2）
  const nextVersion = `${major}.${nextMinor}.${padded}`;
  console.log(`🔼 bump: ${v.tauri} → ${nextVersion}（PATCH 上限 ${PATCH_MAX}，溢出自动进位）`);
  setVersion(nextVersion);
  return nextVersion;
}

async function main() {
  const args = process.argv.slice(2);

  // --bump：PATCH +1，超过 99 自动进位
  if (args[0] === '--bump') {
    bumpVersion();
    return;
  }

  // --check [tag]
  if (args[0] === '--check') {
    const { ok } = checkConsistency();
    if (!ok) process.exit(1);

    const tag = args[1];
    if (tag) {
      const expected = tag.replace(/^v/, '');
      const { tauri } = currentVersions();
      if (tauri !== expected) {
        console.error(`❌ git tag "${tag}" 与项目版本 "${tauri}" 不一致`);
        process.exit(1);
      }
      console.log(`✅ git tag "${tag}" 与项目版本 ${tauri} 一致`);
    }
    return;
  }

  // 无参数：显示当前版本
  if (args.length === 0) {
    checkConsistency();
    return;
  }

  // 设置版本
  setVersion(args[0]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
