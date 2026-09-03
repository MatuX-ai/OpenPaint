# Iconify 索引说明

## 概述

本目录包含 OpenPaint 内置的 [Iconify](https://iconify.design) 图标索引精简版，
用于 v0.2.0 里程碑的 **资产库与开箱即用体验** 需求。

## 文件说明

| 文件         | 用途                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------- |
| `index.json` | 精简版图标元数据（prefix × name × tags × category），启动时一次性加载到内存（~ 12 KB）        |
| `cache/`     | 运行时按需缓存的 SVG body（首次访问 Iconify API 后写入，默认目录 `~/.openpaint/icon-cache/`） |

> ⚠️ **本目录不打包 SVG body**。完整 SVG 在用户首次访问时按需下载，
> 这样安装包只增加 ~ 12 KB，而不是 Iconify 全量 SVG 的 ~ 100 MB。
> 这是 [docs/asset-library-requirements.md](../asset-library-requirements.md) §3.1 的核心设计取舍。

## 当前预置范围

`index.json` 中精选了 6 个图标集共 **83 个最常用图标**：

| Prefix             | 总数 | 协议       | 说明                            |
| ------------------ | ---- | ---------- | ------------------------------- |
| `lucide`           | 18   | ISC        | 默认推荐，矢量风偏写实，UI 友好 |
| `heroicons`        | 14   | MIT        | Tailwind 团队出品，基础风格     |
| `tabler`           | 15   | MIT        | 10500+ 图标的大库，线 风格      |
| `material-symbols` | 14   | Apache-2.0 | Google 官方 Material Design     |
| `phosphor`         | 12   | MIT        | 6 种粗细分级，弹性强            |
| `iconoir`          | 10   | MIT        | French 设计师作品，简洁优雅     |

后续 W9+ 阶段会持续扩充到 4000+ 图标（详见 spec §3.1.2）。

## 更新方法

### 方法 1：手动维护

直接编辑 `index.json`，在 `icons` 数组里追加：

```json
{ "prefix": "lucide", "name": "新图标", "category": "ui", "tags": ["..."] }
```

### 方法 2：自动生成（推荐）

[Iconify 官方提供 JSON API](https://iconify.design/docs/api/collections.html)，
可通过 `https://api.iconify.design/collection?prefix=lucide` 获取整个 prefix 的所有图标。

计划写一个 `scripts/gen-iconify-index.mjs`（Node.js）：

```bash
# 用法（待实现）
node scripts/gen-iconify-index.mjs --prefixes lucide,heroicons,tabler \
    --max-per-prefix 500 --output assets/iconify/index.json
```

脚本逻辑：

1. 对每个 prefix 请求 `https://api.iconify.design/collection?prefix={prefix}` 拿原始 JSON。
2. 抽取 `icons` 字段（key 是图标名）。
3. 加上 `category`（按 Iconify 的 `categories` 字段）+ `tags`（默认取图标 name 的同义词）。
4. 写到 `index.json`。

> 该脚本计划 W9 评审通过后落地，**本期不做**。

## CDN 配置

`index.json` 中默认 CDN：

| 用途                 | URL                                     |
| -------------------- | --------------------------------------- |
| 主 CDN               | `https://api.iconify.design`            |
| 备用 CDN（国内友好） | `https://cdn.jsdelivr.net/npm/@iconify` |

下载单图标示例：

```
GET https://api.iconify.design/{prefix}.json?icons={name1},{name2}
```

返回结构：

```json
{
  "prefix": "lucide",
  "icons": {
    "search": {
      "body": "<path d=\"...\"/>",
      "left": 0,
      "top": 0,
      "width": 24,
      "height": 24
    }
  },
  "width": 24,
  "height": 24
}
```

完整 SVG 字符串：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64">
  <path d="..." fill="currentColor"/>
</svg>
```

## 协议与署名

| Prefix           | License    | 是否要求署名                 |
| ---------------- | ---------- | ---------------------------- |
| lucide           | ISC        | 否                           |
| heroicons        | MIT        | 否                           |
| tabler           | MIT        | 否                           |
| material-symbols | Apache-2.0 | 是（已在应用内"关于"页标注） |
| phosphor         | MIT        | 否                           |
| iconoir          | MIT        | 否                           |

应用首次启动会一次性 Toast 提示：本应用使用 Lucide / Material Symbols 等开源图标，
详见"设置 → 关于 → 第三方资源"。

## 关联文档

- 需求规格：[docs/asset-library-requirements.md](../asset-library-requirements.md)
- MCP 工具定义：[src-tauri/src/agent/mcp.rs](../../src-tauri/src/agent/mcp.rs) `search_icons` / `render_icon_svg`
- 前端组件：[src-web/src/components/asset/](../../src-web/src/components/asset/)
