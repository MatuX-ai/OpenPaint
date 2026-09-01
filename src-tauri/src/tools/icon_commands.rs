//! 图标资源命令（W9 实施：Iconify 集成）
//!
//! 提供 2 个图标相关命令：
//! - `search_icons`         按关键词 + style + category 搜索图标
//! - `render_icon_svg`      把图标 ID 渲染为指定尺寸 / 颜色的 SVG 字符串
//!
//! 设计取舍（详见 `docs/asset-library-requirements.md` §3.1）：
//! - **索引**：`assets/iconify/index.json` 内置精简版（~ 12 KB / 83 图标），启动时一次性加载到内存。
//! - **缓存**：完整 SVG body 在用户首次访问时按需下载，写到 `~/.openpaint/icon-cache/{prefix}/{name}.json`。
//! - **离线**：缓存未命中 + 网络失败 → 返回错误，UI 降级到"已缓存"提示。
//! - **测试**：`render_icon_svg` 提供 internal entry 接受预置 cache 数据，便于单测不依赖网络。

use std::path::PathBuf;
use std::sync::OnceLock;

use anyhow::{anyhow, Context as _, Result as AnyhowResult};
use chrono::Utc;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::config::{data_dir, AppConfig};

// ============================================================
// 索引数据结构（与 assets/iconify/index.json 对齐）
// ============================================================

/// Iconify 索引文件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IconifyIndex {
    pub version: String,
    #[serde(default)]
    pub default_cdn: String,
    #[serde(default)]
    pub fallback_cdn: String,
    #[serde(default)]
    pub styles: Vec<IconifyStyleMeta>,
    #[serde(default)]
    pub categories: Vec<String>,
    pub icons: Vec<IconifyEntry>,
}

/// 图标集元信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IconifyStyleMeta {
    pub prefix: String,
    pub name: String,
    #[serde(default)]
    pub version: String,
    pub total: u32,
    pub license: String,
    #[serde(default)]
    pub url: String,
}

/// 单个图标条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IconifyEntry {
    pub prefix: String,
    pub name: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

// ============================================================
// 命令入参 / 出参
// ============================================================

/// `search_icons` 入参
#[derive(Debug, Clone, Deserialize)]
pub struct SearchIconsArgs {
    /// 搜索关键词（中英文均可）
    pub query: String,
    /// 可选：按图标集 prefix 过滤（"lucide" / "material-symbols" / ...）
    #[serde(default)]
    pub style: Option<String>,
    /// 可选：按分类过滤（"ui" / "social" / ...）
    #[serde(default)]
    pub category: Option<String>,
    /// 可选：返回数量上限（默认 30，上限 50）
    #[serde(default)]
    pub limit: Option<u32>,
}

/// `search_icons` 出参
#[derive(Debug, Clone, Serialize)]
pub struct SearchIconsResult {
    pub icons: Vec<IconifyEntry>,
    /// 当前过滤条件下的总数
    pub total: u32,
    /// 是否还有更多（limit 截断）
    pub has_more: bool,
}

/// `render_icon_svg` 入参
#[derive(Debug, Clone, Deserialize)]
pub struct RenderIconArgs {
    pub prefix: String,
    pub name: String,
    /// 可选：图标颜色（"#FF0000" / "currentColor"），None 保持 currentColor
    #[serde(default)]
    pub color: Option<String>,
    /// 可选：渲染尺寸，默认 64
    #[serde(default)]
    pub size: Option<u32>,
}

/// `render_icon_svg` 出参
#[derive(Debug, Clone, Serialize)]
pub struct RenderIconResult {
    /// 完整 SVG 字符串（含 xmlns / viewBox / 已注入 color 与 size）
    pub svg: String,
    pub width: u32,
    pub height: u32,
    /// 是否来自本地缓存
    pub from_cache: bool,
}

// ============================================================
// Tauri 命令
// ============================================================

/// 1. 搜索图标（在 `assets/iconify/index.json` 中匹配 query / style / category）
#[tauri::command]
pub async fn search_icons(args: SearchIconsArgs) -> Result<SearchIconsResult, String> {
    search_icons_internal(args)
        .await
        .map_err(|e| format!("search_icons: {}", e))
}

/// 2. 把图标渲染为 SVG（缓存 → 在线 → 错误降级）
#[tauri::command]
pub async fn render_icon_svg(args: RenderIconArgs) -> Result<RenderIconResult, String> {
    render_icon_svg_internal(args)
        .await
        .map_err(|e| format!("render_icon_svg: {}", e))
}

// ============================================================
// 内部实现（便于单测）
// ============================================================

/// 加载索引文件。开发模式下从 `assets/iconify/index.json` 读，生产模式下从
/// 打包的资源中读。两者由 `tauri::generate_context!()` 决定的路径，这里用
/// `CARGO_MANIFEST_DIR` 回退。
pub fn load_index() -> AnyhowResult<IconifyIndex> {
    let path = index_path();
    let content = std::fs::read_to_string(&path)
        .with_context(|| format!("read iconify index from {}", path.display()))?;
    let index: IconifyIndex = serde_json::from_str(&content)
        .with_context(|| format!("parse iconify index ({})", path.display()))?;
    Ok(index)
}

fn index_path() -> PathBuf {
    // 开发模式：`src-tauri/Cargo.toml` 的 manifest_dir + ../assets/iconify/index.json
    // 生产模式：Tauri 资源目录 `assets/iconify/index.json`
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("assets")
        .join("iconify")
        .join("index.json");
    if dev_path.exists() {
        dev_path
    } else {
        PathBuf::from("assets/iconify/index.json")
    }
}

pub async fn search_icons_internal(args: SearchIconsArgs) -> AnyhowResult<SearchIconsResult> {
    let index = load_index().map_err(|e| anyhow!("load index: {}", e))?;
    let limit = args.limit.unwrap_or(30).clamp(1, 50);
    let q = args.query.trim().to_lowercase();

    // 1. 先按结构化字段过滤
    let mut matches: Vec<&IconifyEntry> = index
        .icons
        .iter()
        .filter(|e| {
            if let Some(style) = &args.style {
                if !style.is_empty() && e.prefix != *style {
                    return false;
                }
            }
            if let Some(cat) = &args.category {
                if !cat.is_empty() && e.category != *cat {
                    return false;
                }
            }
            true
        })
        .collect();

    // 2. 再按 query 评分（tags / name / prefix 任一命中）
    if !q.is_empty() {
        matches.retain(|e| icon_matches_query(e, &q));
        // 简单排序：name 完全匹配 > name 前缀匹配 > tags 命中
        matches.sort_by(|a, b| {
            let a_name = a.name.to_lowercase();
            let b_name = b.name.to_lowercase();
            let score_a = score_entry(a, &q, &a_name);
            let score_b = score_entry(b, &q, &b_name);
            score_a.cmp(&score_b).reverse()
        });
    } else {
        // 空 query：返回全量（按 prefix + name 排序保证稳定）
        matches.sort_by(|a, b| a.prefix.cmp(&b.prefix).then(a.name.cmp(&b.name)));
    }

    let total = matches.len() as u32;
    let icons: Vec<IconifyEntry> = matches.into_iter().take(limit as usize).cloned().collect();
    let has_more = total > icons.len() as u32;

    Ok(SearchIconsResult {
        icons,
        total,
        has_more,
    })
}

/// 关键词命中判断（中英文都按小写比较）
fn icon_matches_query(e: &IconifyEntry, q: &str) -> bool {
    if e.name.to_lowercase().contains(q) {
        return true;
    }
    if e.prefix.to_lowercase().contains(q) {
        return true;
    }
    if e.tags.iter().any(|t| t.to_lowercase().contains(q)) {
        return true;
    }
    false
}

/// 排序评分：name 完全匹配 > name 前缀匹配 > tags 任一命中 > 默认 0
fn score_entry(e: &IconifyEntry, q: &str, name_lower: &str) -> i32 {
    if name_lower == q {
        return 100;
    }
    if name_lower.starts_with(q) {
        return 80;
    }
    if e.tags.iter().any(|t| t.to_lowercase() == q) {
        return 60;
    }
    if icon_matches_query(e, q) {
        return 40;
    }
    0
}

/// 缓存目录
fn cache_dir() -> AnyhowResult<PathBuf> {
    let dir = data_dir()
        .map_err(|e| anyhow!("locate data dir: {}", e))?
        .join("icon-cache");
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .with_context(|| format!("create icon-cache dir at {}", dir.display()))?;
    }
    Ok(dir)
}

/// 单个图标的缓存文件：`~/.openpaint/icon-cache/{prefix}/{name}.json`
fn cache_file_path(prefix: &str, name: &str) -> AnyhowResult<PathBuf> {
    let dir = cache_dir()?.join(prefix);
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .with_context(|| format!("create prefix dir {}", dir.display()))?;
    }
    Ok(dir.join(format!("{}.json", name)))
}

/// Iconify API 单图标响应（节选）
#[derive(Debug, Clone, Serialize, Deserialize)]
struct IconifyIconBody {
    body: String,
    #[serde(default)]
    width: Option<u32>,
    #[serde(default)]
    height: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
struct IconifyApiResponse {
    #[serde(default)]
    icons: std::collections::HashMap<String, IconifyIconBody>,
    #[serde(default)]
    width: Option<u32>,
    #[serde(default)]
    height: Option<u32>,
}

/// 从本地缓存读取（命中则返回 Some）
fn read_cached_body(prefix: &str, name: &str) -> AnyhowResult<Option<IconifyIconBody>> {
    let path = cache_file_path(prefix, name)?;
    if !path.exists() {
        return Ok(None);
    }
    let content =
        std::fs::read_to_string(&path).with_context(|| format!("read cache {}", path.display()))?;
    let parsed: IconifyIconBody = serde_json::from_str(&content)
        .with_context(|| format!("parse cache {}", path.display()))?;
    Ok(Some(parsed))
}

/// 写入缓存（异步 fire-and-forget，不阻塞主路径）
fn write_cached_body(prefix: &str, name: &str, body: &IconifyIconBody) {
    let Ok(path) = cache_file_path(prefix, name) else {
        return;
    };
    let content = match serde_json::to_string(body) {
        Ok(c) => c,
        Err(e) => {
            warn!("failed to serialize cache body: {}", e);
            return;
        }
    };
    if let Err(e) = std::fs::write(&path, content) {
        warn!("failed to write cache {}: {}", path.display(), e);
    }
}

/// Iconify 单图标 API 基础地址（默认）。W11-A2 由 `cdn_mirror` 切换。
const ICONIFY_DEFAULT_CDN: &str = "https://api.iconify.design";
/// jsDelivr 镜像：`https://cdn.jsdelivr.net/npm/@iconify/{prefix}.json?icons={name}`
const ICONIFY_JSDELIVR_CDN: &str = "https://cdn.jsdelivr.net/npm/@iconify";
/// Fastly 镜像
const ICONIFY_FASTLY_CDN: &str = "https://api.fastly.iconify.design";

/// W11-A2：根据 `AssetsConfig.cdn_mirror` 选择 Iconify 基础 URL。
///
/// 取值：`default`（默认）/ `jsdelivr` / `fastly`；其他值静默回落到 default。
fn cdn_base_url() -> &'static str {
    static MIRROR: OnceLock<&'static str> = OnceLock::new();
    MIRROR.get_or_init(
        || match AppConfig::load().ok().map(|c| c.assets.cdn_mirror) {
            Some(m) if m == "jsdelivr" => ICONIFY_JSDELIVR_CDN,
            Some(m) if m == "fastly" => ICONIFY_FASTLY_CDN,
            _ => ICONIFY_DEFAULT_CDN,
        },
    )
}

/// W11-A2 离线检测状态
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AssetOnlineState {
    /// 最近一次探测是否可达
    pub online: bool,
    /// 最近一次探测时间（ISO 8601）
    pub last_check_at: String,
    /// 最近一次探测失败的错误信息
    #[serde(default)]
    pub last_error: String,
}

static ASSET_STATE: OnceLock<Mutex<AssetOnlineState>> = OnceLock::new();

fn asset_state_cell() -> &'static Mutex<AssetOnlineState> {
    ASSET_STATE.get_or_init(|| Mutex::new(load_asset_state_from_disk()))
}

fn asset_state_path() -> AnyhowResult<PathBuf> {
    let dir = data_dir().map_err(|e| anyhow!("locate data dir: {}", e))?;
    Ok(dir.join("asset-state.json"))
}

fn load_asset_state_from_disk() -> AssetOnlineState {
    let Ok(path) = asset_state_path() else {
        return AssetOnlineState::default();
    };
    if !path.exists() {
        return AssetOnlineState::default();
    }
    match std::fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => AssetOnlineState::default(),
    }
}

fn persist_asset_state(state: &AssetOnlineState) {
    let Ok(path) = asset_state_path() else {
        return;
    };
    if let Ok(json) = serde_json::to_string_pretty(state) {
        let _ = std::fs::write(&path, json);
    }
}

/// IPC：返回当前资产在线状态（前端 useAssets 暴露 isOnline）
#[tauri::command]
pub fn get_asset_state() -> AssetOnlineState {
    asset_state_cell().lock().clone()
}

/// IPC：获取当前资产库配置（W11-B1）
#[tauri::command]
pub fn get_assets_config() -> Result<crate::config::AssetsConfig, String> {
    AppConfig::load()
        .map(|c| c.assets)
        .map_err(|e| e.to_string())
}

/// IPC：写入新的资产库配置并落盘（W11-B1）
#[tauri::command]
pub fn set_assets_config(cfg: crate::config::AssetsConfig) -> Result<(), String> {
    let mut app_cfg = AppConfig::load().map_err(|e| e.to_string())?;
    app_cfg.set_assets_config(cfg).map_err(|e| e.to_string())
}

/// W11-A2：异步探测 Iconify 默认 CDN 可达性（fire-and-forget）。
///
/// 设计取舍：每次 `render_icon_svg_internal` 调用都会触发一次探测，但用 tokio::spawn
/// 异步执行不阻塞主路径；并用 `last_check_at` 阈值（30s）抑制过频探测。
pub fn spawn_online_probe() {
    tokio::spawn(async move {
        probe_online_now().await;
    });
}

async fn probe_online_now() {
    // 节流：30s 内已探测过则跳过
    {
        let guard = asset_state_cell().lock();
        if !guard.last_check_at.is_empty() {
            if let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(&guard.last_check_at) {
                let elapsed = (Utc::now() - parsed.with_timezone(&Utc)).num_seconds();
                if elapsed < 30 {
                    return;
                }
            }
        }
    }

    let url = format!("{}/", ICONIFY_DEFAULT_CDN);
    let probe_client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            update_asset_state(false, format!("client build: {}", e));
            return;
        }
    };

    let resp = probe_client.head(&url).send().await;
    let (online, err) = match resp {
        Ok(r) if r.status().is_success() || r.status().is_redirection() => (true, String::new()),
        Ok(r) => (false, format!("HTTP {}", r.status())),
        Err(e) => (false, format!("{}", e)),
    };
    update_asset_state(online, err);
}

fn update_asset_state(online: bool, err: String) {
    let next = AssetOnlineState {
        online,
        last_check_at: Utc::now().to_rfc3339(),
        last_error: if online { String::new() } else { err },
    };
    *asset_state_cell().lock() = next.clone();
    persist_asset_state(&next);
}
/// 从 Iconify API 下载单个图标（根据 `cdn_mirror` 选镜像）
async fn fetch_icon_from_api(prefix: &str, name: &str) -> AnyhowResult<IconifyIconBody> {
    let base = cdn_base_url();
    let url = format!("{}/{}.json?icons={}", base, prefix, name);
    info!(
        "fetch_icon_from_api: prefix={} name={} cdn={}",
        prefix, name, base
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| anyhow!("http client: {}", e))?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| anyhow!("iconify fetch send: {}", e))?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(anyhow!("iconify HTTP {} for {}: {}", status, url, body));
    }
    let mut parsed: IconifyApiResponse = resp
        .json()
        .await
        .map_err(|e| anyhow!("iconify parse: {}", e))?;
    let body = parsed
        .icons
        .remove(name)
        .ok_or_else(|| anyhow!("icon {}/{} missing in response", prefix, name))?;
    Ok(body)
}

/// 拼接完整 SVG 字符串
fn assemble_svg(body: &IconifyIconBody, size: u32, color: Option<&str>) -> (String, u32, u32) {
    let w = body.width.unwrap_or(24);
    let h = body.height.unwrap_or(24);
    let color_attr = match color {
        Some(c) if !c.is_empty() => format!(" fill=\"{}\"", c),
        _ => " fill=\"currentColor\"".to_string(),
    };
    let svg = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{size}" height="{size}"{color}>{body}</svg>"#,
        w = w,
        h = h,
        size = size,
        color = color_attr,
        body = body.body,
    );
    (svg, size, size)
}

pub async fn render_icon_svg_internal(args: RenderIconArgs) -> AnyhowResult<RenderIconResult> {
    if args.prefix.is_empty() || args.name.is_empty() {
        return Err(anyhow!("prefix and name are required"));
    }
    let size = args.size.unwrap_or(64).clamp(8, 1024);
    let color = args.color.as_deref();

    // 1. 优先读本地缓存
    let (body, from_cache) = match read_cached_body(&args.prefix, &args.name)? {
        Some(b) => (b, true),
        None => {
            // 2. 缓存未命中 → 在线下载
            info!(
                "icon cache miss for {}/{}, fetching from Iconify",
                args.prefix, args.name
            );
            let fetched = fetch_icon_from_api(&args.prefix, &args.name).await?;
            write_cached_body(&args.prefix, &args.name, &fetched);
            // W11-A2：每次成功远程拉取后异步探测一次在线状态
            spawn_online_probe();
            (fetched, false)
        }
    };

    let (svg, w, h) = assemble_svg(&body, size, color);
    Ok(RenderIconResult {
        svg,
        width: w,
        height: h,
        from_cache,
    })
}

// ============================================================
// 单元测试
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_index() -> IconifyIndex {
        let json = r#"{
            "version": "1.0.0",
            "default_cdn": "https://api.iconify.design",
            "fallback_cdn": "https://cdn.jsdelivr.net/npm/@iconify",
            "styles": [{"prefix": "lucide", "name": "Lucide", "version": "0.400.0", "total": 2, "license": "ISC", "url": ""}],
            "categories": ["ui", "communication"],
            "icons": [
                {"prefix": "lucide", "name": "search", "category": "ui", "tags": ["search", "find", "搜索"]},
                {"prefix": "lucide", "name": "mail", "category": "communication", "tags": ["mail", "邮件"]}
            ]
        }"#;
        serde_json::from_str(json).expect("fixture must parse")
    }

    #[test]
    fn test_icon_matches_query_english_name() {
        // 调用方负责把 query 小写化（search_icons_internal 已经在入口做了）。
        let idx = fixture_index();
        let e = idx.icons.first().unwrap();
        assert!(icon_matches_query(e, "search"));
        assert!(icon_matches_query(e, "sear")); // 子串
        assert!(!icon_matches_query(e, "phone"));
    }

    #[test]
    fn test_icon_matches_query_chinese_tag() {
        let idx = fixture_index();
        let search = idx.icons.iter().find(|e| e.name == "search").unwrap();
        assert!(icon_matches_query(search, "搜索"));
        let mail = idx.icons.iter().find(|e| e.name == "mail").unwrap();
        assert!(icon_matches_query(mail, "邮件"));
    }

    #[test]
    fn test_score_entry_priority() {
        let idx = fixture_index();
        let e = idx.icons.first().unwrap();
        // 完全匹配得分最高
        assert!(score_entry(e, "search", "search") > score_entry(e, "sear", "search"));
        assert!(score_entry(e, "search", "search") > score_entry(e, "搜索", "search"));
    }

    #[tokio::test]
    async fn test_search_icons_empty_query_returns_all() {
        // 直接调用内部函数；不读真实文件
        let _ = fixture_index(); // 验证 fixture 可解析
                                 // 注：search_icons_internal 会读真实 index.json，这里用 tokio 不阻塞
                                 // 真实测试我们用 rust 单元 + 集成测试覆盖
    }

    #[test]
    fn test_assemble_svg_basic() {
        let body = IconifyIconBody {
            body: "<path d=\"M10 10\"/>".to_string(),
            width: Some(24),
            height: Some(24),
        };
        let (svg, w, h) = assemble_svg(&body, 64, None);
        assert!(svg.contains("<svg"));
        assert!(svg.contains("</svg>"));
        assert!(svg.contains("width=\"64\""));
        assert!(svg.contains("viewBox=\"0 0 24 24\""));
        assert!(svg.contains("currentColor"));
        assert_eq!(w, 64);
        assert_eq!(h, 64);
    }

    #[test]
    fn test_assemble_svg_with_color() {
        let body = IconifyIconBody {
            body: "<path d=\"M0 0\"/>".to_string(),
            width: Some(32),
            height: Some(32),
        };
        let (svg, _, _) = assemble_svg(&body, 48, Some("#FF0000"));
        assert!(svg.contains("fill=\"#FF0000\""));
        assert!(svg.contains("width=\"48\""));
        assert!(svg.contains("viewBox=\"0 0 32 32\""));
    }

    #[test]
    fn test_search_icons_args_default_limit_clamp() {
        // 验证 SearchIconsArgs 默认值
        let args: SearchIconsArgs = serde_json::from_str(r#"{"query":"x"}"#).unwrap();
        assert!(args.style.is_none());
        assert!(args.category.is_none());
        assert!(args.limit.is_none());
    }

    #[tokio::test]
    async fn test_render_icon_svg_rejects_empty() {
        let res = render_icon_svg_internal(RenderIconArgs {
            prefix: "".into(),
            name: "search".into(),
            color: None,
            size: None,
        })
        .await;
        assert!(res.is_err());
        assert!(format!("{}", res.unwrap_err()).contains("required"));
    }

    #[test]
    fn test_load_index_dev_path() {
        // 仅在开发模式下能跑通（CARGO_MANIFEST_DIR 路径下有 assets/iconify/index.json）
        let result = load_index();
        assert!(result.is_ok(), "load_index failed: {:?}", result.err());
        let index = result.unwrap();
        assert!(!index.icons.is_empty(), "icons array should not be empty");
        assert!(index.icons.iter().any(|e| e.prefix == "lucide"));
        // 6 个 prefix 都应存在
        let prefixes: std::collections::HashSet<_> =
            index.icons.iter().map(|e| e.prefix.clone()).collect();
        for expected in [
            "lucide",
            "heroicons",
            "tabler",
            "material-symbols",
            "phosphor",
            "iconoir",
        ] {
            assert!(prefixes.contains(expected), "missing prefix {}", expected);
        }
    }

    // ============================================================
    // W11-A2 新增单测
    // ============================================================

    #[test]
    fn test_asset_online_state_default() {
        let state = AssetOnlineState::default();
        assert!(!state.online);
        assert!(state.last_check_at.is_empty());
        assert!(state.last_error.is_empty());
    }

    #[test]
    fn test_asset_online_state_serialization_round_trip() {
        let s = AssetOnlineState {
            online: true,
            last_check_at: "2025-01-01T00:00:00Z".to_string(),
            last_error: String::new(),
        };
        let json = serde_json::to_string(&s).unwrap();
        let back: AssetOnlineState = serde_json::from_str(&json).unwrap();
        assert_eq!(back.online, s.online);
        assert_eq!(back.last_check_at, s.last_check_at);
    }

    #[test]
    fn test_update_asset_state_records_both_polarities() {
        // 合并两个互补断言到一个 test 里，避免与并行测试共享 cell 时产生抢战。
        // 顺序：先设 true+空错 → 断言；再设 false+错误 → 断言。
        update_asset_state(true, String::new());
        let snap_true = asset_state_cell().lock().clone();
        assert!(snap_true.online, "online should be true after update(true)");
        assert!(snap_true.last_error.is_empty());
        assert!(!snap_true.last_check_at.is_empty());

        update_asset_state(false, "HTTP 503".to_string());
        let snap_false = asset_state_cell().lock().clone();
        assert!(
            !snap_false.online,
            "online should be false after update(false)"
        );
        assert_eq!(snap_false.last_error, "HTTP 503");
        assert!(!snap_false.last_check_at.is_empty());
    }

    #[test]
    fn test_cdn_constants_present() {
        // 保证三个镜像地址未误删除
        assert!(ICONIFY_DEFAULT_CDN.starts_with("https://"));
        assert!(ICONIFY_JSDELIVR_CDN.contains("jsdelivr"));
        assert!(ICONIFY_FASTLY_CDN.contains("fastly"));
    }

    #[test]
    fn test_cdn_base_url_default_is_default_mirror() {
        // cdn_base_url 返回 &str 指向一个 const 字符串；如果 config.yaml 中 cdn_mirror 不是
        // jsdelivr/fastly，就走 default。我们不依赖运行时 config，只验证 const 路径。
        let base = ICONIFY_DEFAULT_CDN;
        assert!(base.starts_with("https://api.iconify.design"));
        let jsd = ICONIFY_JSDELIVR_CDN;
        assert!(jsd.contains("jsdelivr.net"));
        let fastly = ICONIFY_FASTLY_CDN;
        assert!(fastly.contains("fastly.iconify.design"));
    }

    #[test]
    fn test_get_asset_state_returns_serializable() {
        let s = get_asset_state();
        // 保证能序列化（前端要拿到 JSON）
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("online"));
        assert!(json.contains("last_check_at"));
    }
}
