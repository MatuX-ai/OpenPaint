# 默认画刷（W10 实施）

## 概述

本目录包含 OpenPaint 内置的 8 个 PNG 笔刷（v0.2.0 / W10）。
每个 PNG 是 256×256 RGBA，中心白色 → 边缘 alpha 渐变，作为画笔笔触的 stamp 模板。

| ID           | 中文     | English    | 类别    | 适用场景                |
| ------------ | -------- | ---------- | ------- | ----------------------- |
| `round-hard` | 硬边圆头 | Round Hard | Hard    | 默认画笔、勾线、UI 设计 |
| `round-soft` | 软边圆头 | Round Soft | Soft    | 通用涂抹、上色          |
| `chalk`      | 粉笔     | Chalk      | Texture | 手写粉笔、复古风插画    |
| `spray`      | 喷枪     | Spray      | Texture | 阴影、噪点、特殊效果    |
| `watercolor` | 水彩     | Watercolor | Texture | 柔和水彩边缘、淡彩      |
| `oil-paint`  | 油画厚涂 | Oil Paint  | Texture | 厚涂笔触、艺术化处理    |
| `marker`     | 马克笔   | Marker     | Mark    | 平面插画、概念设计      |
| `blur`       | 模糊     | Blur       | Special | 边缘模糊、橡皮变体      |

> 软边圆头（`round-soft`）是默认 fallback 笔刷；硬边圆头（`round-hard`）是
> 应用首次启动时 `canvasStore.activeBrushId` 的初始值（与上一版本保持兼容）。

## 文件规格

| 属性       | 值                                          |
| ---------- | ------------------------------------------- |
| 尺寸       | 256 × 256                                   |
| 格式       | PNG-24（RGBA，含 alpha）                    |
| 颜色       | 中心 RGB=(255,255,255)；边缘 alpha 渐变到 0 |
| 单文件大小 | 5 - 31 KB                                   |
| 总计       | < 130 KB                                    |

## 生成方法

由 [`scripts/gen-brushes.mjs`](../../scripts/gen-brushes.mjs) 一次性生成。
纯 Node stdlib（zlib + Buffer），无 native deps，每个笔刷的 falloff / density / jitter
组合如下：

```js
{ id: 'round-hard', falloff: 0.05, density: 1.0,  jitter: 0.0  },
{ id: 'round-soft', falloff: 0.95, density: 1.0,  jitter: 0.0  },
{ id: 'chalk',      falloff: 0.60, density: 0.6,  jitter: 0.35 },
{ id: 'spray',      falloff: 0.50, density: 0.4,  jitter: 0.6  },
{ id: 'watercolor', falloff: 0.85, density: 0.7,  jitter: 0.2  },
{ id: 'oil-paint',  falloff: 0.40, density: 0.85, jitter: 0.4  },
{ id: 'marker',     falloff: 0.70, density: 0.95, jitter: 0.05 },
{ id: 'blur',       falloff: 1.00, density: 0.55, jitter: 0.0  },
```

确定性 PRNG（mulberry32）+ 字符串哈希保证每次输出字节一致。

## 更新笔刷

```bash
node scripts/gen-brushes.mjs
```

输出会覆盖所有 8 个 PNG。如需新增 / 调整，编辑脚本顶部的 `BRUSHES` 数组即可。

## 协议与署名

所有笔刷均为 OpenPaint 项目自绘 / 程序化生成，不依赖第三方美术资源。
本目录**无需署名**，不涉及协议要求。

## 关联文档

- 需求规格：[docs/asset-library-requirements.md §3.2](../../docs/asset-library-requirements.md)
- Rust 数据结构：[src-tauri/src/canvas/brush.rs](../../src-tauri/src/canvas/brush.rs)
- MCP 工具定义：[src-tauri/src/agent/mcp.rs](../../src-tauri/src/agent/mcp.rs)（`create_brush_from_prompt` stub）
- 前端组件：[src-web/src/components/asset/BrushPanel.vue](../../src-web/src/components/asset/BrushPanel.vue)
