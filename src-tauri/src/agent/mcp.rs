//! MCP 协议适配（W4 实施）
//!
//! OpenPaint 作为 MCP 服务器对外暴露原子工具（v0.2 共 15 个）。
//!
//! 工具清单（10 原子 + 2 资产图标 + 2 调色板/渐变 + 1 AI 笔刷 stub）

use serde::{Deserialize, Serialize};

/// MCP 工具定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

/// 列出全部原子工具（M-10）
pub fn tool_definitions() -> Vec<McpToolDefinition> {
    vec![
        McpToolDefinition {
            name: "get_canvas_selection".into(),
            description: "获取当前选区/图层为 Base64 PNG。Chinese: 获取当前选区或活动图层为 PNG（Base64 编码），便于传给 LLM 或保存到图库。".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "layer_id": { "type": "string", "description": "可选，指定图层 ID；不传则取活动图层" }
                }
            }),
        },
        McpToolDefinition {
            name: "get_selection_bounds".into(),
            description: "获取选区坐标与尺寸。Chinese: 返回当前矩形选区的 {x, y, width, height}。无选区时返回 {width:0,height:0}。".into(),
            input_schema: serde_json::json!({ "type": "object", "properties": {} }),
        },
        McpToolDefinition {
            name: "paste_image_to_layer".into(),
            description: "将 Base64 图片粘贴到当前图层。Chinese: 把 Base64 编码的 PNG/SVG 渲染结果粘贴到指定图层（默认活动图层）。".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "required": ["image_data"],
                "properties": {
                    "image_data": { "type": "string", "description": "Base64 编码图片（PNG/SVG/JPEG 均可）" },
                    "layer_id":   { "type": "string", "description": "可选，目标图层 UUID，不传则粘贴到活动图层" }
                }
            }),
        },
        McpToolDefinition {
            name: "get_layer_info".into(),
            description: "获取所有图层信息。Chinese: 返回画布所有图层的列表（id / 名称 / 可见性 / 锁定 / 不透明度 / 混合模式）。".into(),
            input_schema: serde_json::json!({ "type": "object", "properties": {} }),
        },
        McpToolDefinition {
            name: "send_to_ai_engine".into(),
            description: "发送图源 + Prompt 给 OpenPencil。Chinese: 把图源（Base64 PNG）+ 用户提示词发送给 OpenPencil LLM，返回新 SVG / 修改建议。".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "required": ["image_data", "prompt"],
                "properties": {
                    "image_data": { "type": "string", "description": "图源 Base64 PNG" },
                    "prompt":     { "type": "string", "description": "自然语言指令（中文/英文均可）" }
                }
            }),
        },
        McpToolDefinition {
            name: "render_svg_to_png".into(),
            description: "将 SVG 渲染为指定尺寸 PNG。Chinese: 用 resvg 把 SVG 字符串渲染为指定 width×height 的 PNG（Base64 编码返回）。".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "required": ["svg", "width", "height"],
                "properties": {
                    "svg":    { "type": "string",  "description": "完整 SVG 字符串" },
                    "width":  { "type": "integer", "description": "输出宽度（像素）" },
                    "height": { "type": "integer", "description": "输出高度（像素）" }
                }
            }),
        },
        McpToolDefinition {
            name: "get_current_svg".into(),
            description: "获取 OpenPencil 当前文档 SVG。Chinese: 读取 OpenPencil 当前打开文档的 SVG 源代码（用于二次编辑）。".into(),
            input_schema: serde_json::json!({ "type": "object", "properties": {} }),
        },
        McpToolDefinition {
            name: "save_to_gallery".into(),
            description: "保存图片到图库。Chinese: 把 Base64 图片保存到本地图库（含缩略图 + 元数据 + tags）。".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "required": ["image_data", "tags"],
                "properties": {
                    "image_data": { "type": "string", "description": "Base64 图片" },
                    "tags":       { "type": "array",  "items": { "type": "string" }, "description": "标签数组（中文/英文均可）" },
                    "group_id":   { "type": "string", "description": "可选，分组 ID" }
                }
            }),
        },
        McpToolDefinition {
            name: "search_gallery".into(),
            description: "按标签/关键词搜索图库。Chinese: 在本地图库中按 tag/关键词模糊搜索，返回匹配的图片元数据列表。".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "required": ["query"],
                "properties": {
                    "query": { "type": "string",  "description": "搜索关键词（中文/英文均可）" },
                    "limit": { "type": "integer", "description": "返回数量上限，默认 30" }
                }
            }),
        },
        McpToolDefinition {
            name: "get_gallery_image".into(),
            description: "按 ID 获取图库原图。Chinese: 通过图库记录 ID 获取原图（Base64 PNG）和元数据。".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "required": ["record_id"],
                "properties": {
                    "record_id": { "type": "string", "description": "图库记录 UUID" }
                }
            }),
        },
        // W9 资产库 · 图标
        McpToolDefinition {
            name: "search_icons".into(),
            description: "按关键词 + style + category 搜索图标（Iconify 集成），返回一个候选列表。Chinese: 按关键词搜索 6 套图标集（Lucide / Heroicons / Tabler / Material Symbols / Phosphor / Iconoir），支持中英文。典型流程：search_icons(query=\"搜索\") → 选一个 → render_icon_svg(prefix, name)。".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "required": ["query"],
                "properties": {
                    "query":    { "type": "string",  "description": "搜索关键词（中英文均可，例如：\"搜索\"、\"home\"、\"邮件\"）" },
                    "style":    { "type": "string",  "description": "图标集 prefix（lucide / heroicons / tabler / material-symbols / phosphor / iconoir）" },
                    "category": { "type": "string",  "description": "分类（ui / social / media / file / device / communication / navigation / finance / weather / other）" },
                    "limit":    { "type": "integer", "description": "返回数量上限，默认 30，上限 50" }
                }
            }),
        },
        McpToolDefinition {
            name: "render_icon_svg".into(),
            description: "把图标 ID 渲染为指定尺寸 / 颜色的 SVG 字符串（带本地缓存 + Iconify 在线兑底）。Chinese: 把 search_icons 返回的 prefix/name 渲染为完整可用的 SVG；带 24h 本地缓存，离线时返回错误。可选 color (#RRGGBB) 和 size (8-1024)。".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "required": ["prefix", "name"],
                "properties": {
                    "prefix": { "type": "string",  "description": "图标集 prefix（如 lucide / material-symbols）" },
                    "name":   { "type": "string",  "description": "图标名（如 search / home / mail）" },
                    "color":  { "type": "string",  "description": "图标颜色（如 #FF0000），不传默认 currentColor" },
                    "size":   { "type": "integer", "description": "渲染尺寸（默认 64，上限 1024）" }
                }
            }),
        },
        // W10 资产库 · 调色板
        McpToolDefinition {
            name: "apply_palette".into(),
            description: "应用一整套调色板到指定图层。Chinese: 加载预设调色板（material / tailwind / pastel / mono）。mode 默认 swatch_bar（在图层底部追加 32px 色条，不破坏现有像素）；mode=replace_color 时把图层中匹配的主色像素替换为调色板首色。".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "required": ["palette_id"],
                "properties": {
                    "palette_id":  { "type": "string",  "description": "调色板 ID：material / tailwind / pastel / mono（也可先调 list_palettes 拿全量）" },
                    "layer_id":    { "type": "string",  "description": "可选，目标图层 UUID；不传则用活动图层" },
                    "mode":        { "type": "string",  "description": "swatch_bar | replace_color，默认 swatch_bar" },
                    "replace_hex": { "type": "string",  "description": "replace_color 模式下的目标颜色（#RRGGBB），不传则取调色板第一色" }
                }
            }),
        },
        // W10 资产库 · 渐变
        McpToolDefinition {
            name: "apply_gradient".into(),
            description: "应用预设渐变到指定图层（用 SVG 渐变填充整张图层）。Chinese: 加载 16 个渐变预设（8 线性 + 5 径向 + 3 锥形），用 resvg 渲染后写入图层。预设 ID 通过 list_gradients 拿到，典型 ID 形如 linear-sunset / radial-glow / conic-rainbow。".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "required": ["gradient_id"],
                "properties": {
                    "gradient_id": { "type": "string",  "description": "渐变 ID（linear-* / radial-* / conic-* 共 16 个）" },
                    "layer_id":    { "type": "string",  "description": "可选，目标图层 UUID；不传则用活动图层" },
                    "opacity":     { "type": "number",  "description": "不透明度 0-1，默认 1.0" }
                }
            }),
        },
        // W11 资产库 · AI 生成画刷（v0.2 stub：仅注册不实现）
        McpToolDefinition {
            name: "create_brush_from_prompt".into(),
            description: "根据文字描述生成自定义笔刷 PNG（v0.3 实现）。Chinese: 根据自然语言描述合成自定义笔刷 PNG。v0.2 仅在 MCP 注册表占位，调用固定返回 { status:\"not_implemented\", message:\"AI brush generation available in v0.3\" }，前端用 ToolCallCard 展示 stub 状态。".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "required": ["prompt"],
                "properties": {
                    "prompt": { "type": "string", "description": "笔刷描述（如\"像羽毛一样的笔刷\"、\"粗糙的水彩边缘\"）" },
                    "name":   { "type": "string", "description": "可选，笔刷中文名" }
                }
            }),
        },
    ]
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    /// 返回所有工具名，方便测试断言。
    fn all_tool_names() -> Vec<String> {
        tool_definitions().into_iter().map(|t| t.name).collect()
    }

    #[test]
    fn test_tool_definitions_total_count_is_15() {
        let tools = tool_definitions();
        assert_eq!(tools.len(), 15, "原子工具数应 = 15");
    }

    #[test]
    fn test_tool_definitions_no_duplicate_names() {
        let names = all_tool_names();
        let mut sorted = names.clone();
        sorted.sort();
        let before = sorted.len();
        sorted.dedup();
        assert_eq!(sorted.len(), before, "工具名不可重复");
    }

    #[test]
    fn test_every_tool_has_required_fields() {
        let tools = tool_definitions();
        for t in tools {
            assert!(!t.name.is_empty(), "name 不能为空");
            assert!(!t.description.is_empty(), "description 不能为空");
            assert!(t.input_schema.is_object(), "input_schema 必须是对象");
            assert_eq!(
                t.input_schema["type"],
                "object",
                "{}: type 应为 object",
                t.name
            );
        }
    }

    #[test]
    fn test_every_tool_description_contains_chinese() {
        // 中文描述是产品要求，确保未被简化掉
        for t in tool_definitions() {
            let has_cjk = t.description.chars().any(|c| {
                let cp = c as u32;
                (0x4E00..=0x9FFF).contains(&cp)
            });
            assert!(has_cjk, "{}: description 应包含中文", t.name);
        }
    }

    #[test]
    fn test_required_fields_are_declared() {
        // 每个工具的 required 字段必须是 properties 里的 key
        for t in tool_definitions() {
            let required = t.input_schema["required"].as_array();
            if let Some(req) = required {
                let props = t.input_schema["properties"].as_object();
                for r in req {
                    let name = r.as_str().unwrap();
                    if let Some(p) = props {
                        assert!(
                            p.contains_key(name),
                            "{}: required '{}' 必须在 properties 中",
                            t.name,
                            name
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn test_core_tools_present() {
        let names = all_tool_names();
        for n in [
            "get_canvas_selection",
            "get_selection_bounds",
            "paste_image_to_layer",
            "get_layer_info",
            "send_to_ai_engine",
            "render_svg_to_png",
            "get_current_svg",
            "save_to_gallery",
            "search_gallery",
            "get_gallery_image",
        ] {
            assert!(names.contains(&n.to_string()), "缺少工具 {}", n);
        }
    }

    #[test]
    fn test_asset_tools_present() {
        let names = all_tool_names();
        for n in [
            "search_icons",
            "render_icon_svg",
            "apply_palette",
            "apply_gradient",
            "create_brush_from_prompt",
        ] {
            assert!(names.contains(&n.to_string()), "缺少资产库工具 {}", n);
        }
    }

    #[test]
    fn test_specific_tool_schemas() {
        let tools = tool_definitions();
        for t in &tools {
            match t.name.as_str() {
                "send_to_ai_engine" => {
                    assert!(t.input_schema["properties"]["image_data"].is_object());
                    assert!(t.input_schema["properties"]["prompt"].is_object());
                }
                "render_svg_to_png" => {
                    let reqd = t.input_schema["required"].as_array().unwrap();
                    assert!(reqd.iter().any(|v| v == "svg"));
                    assert!(reqd.iter().any(|v| v == "width"));
                    assert!(reqd.iter().any(|v| v == "height"));
                }
                "apply_palette" => {
                    let reqd = t.input_schema["required"].as_array().unwrap();
                    assert!(reqd.iter().any(|v| v == "palette_id"));
                }
                "apply_gradient" => {
                    let reqd = t.input_schema["required"].as_array().unwrap();
                    assert!(reqd.iter().any(|v| v == "gradient_id"));
                }
                "create_brush_from_prompt" => {
                    let reqd = t.input_schema["required"].as_array().unwrap();
                    assert!(reqd.iter().any(|v| v == "prompt"));
                }
                "search_icons" => {
                    let reqd = t.input_schema["required"].as_array().unwrap();
                    assert!(reqd.iter().any(|v| v == "query"));
                }
                _ => {}
            }
        }
    }

    #[test]
    fn test_tool_definitions_serializable() {
        // MCP 工具定义需要通过 JSON-RPC 发送给客户端
        let json = serde_json::to_string(&tool_definitions()).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(parsed.is_array());
        assert_eq!(parsed.as_array().unwrap().len(), 15);
    }

    #[test]
    fn test_no_tool_has_empty_required_array() {
        for t in tool_definitions() {
            let reqd = t.input_schema["required"].as_array();
            // 至少有一个工具需要必填项
            if let Some(r) = reqd {
                assert!(!r.is_empty(), "{}: required 不能为空数组", t.name);
            }
        }
    }
}
