//! MCP 协议适配（W4 实施）
//!
//! OpenPaint 作为 MCP 服务器对外暴露 10 个原子工具。

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
            description: "获取当前选区/图层为 Base64 PNG".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "layer_id": { "type": "string", "description": "可选，指定图层 ID" }
                }
            }),
        },
        McpToolDefinition {
            name: "get_selection_bounds".into(),
            description: "获取选区坐标与尺寸".into(),
            input_schema: serde_json::json!({ "type": "object", "properties": {} }),
        },
        McpToolDefinition {
            name: "paste_image_to_layer".into(),
            description: "将 Base64 图片粘贴到当前图层".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "required": ["image_data"],
                "properties": {
                    "image_data": { "type": "string", "description": "Base64 编码图片" }
                }
            }),
        },
        McpToolDefinition {
            name: "get_layer_info".into(),
            description: "获取所有图层信息".into(),
            input_schema: serde_json::json!({ "type": "object", "properties": {} }),
        },
        McpToolDefinition {
            name: "send_to_ai_engine".into(),
            description: "发送图源 + Prompt 给 OpenPencil".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "required": ["image_data", "prompt"],
                "properties": {
                    "image_data": { "type": "string" },
                    "prompt": { "type": "string" }
                }
            }),
        },
        McpToolDefinition {
            name: "render_svg_to_png".into(),
            description: "将 SVG 渲染为指定尺寸 PNG".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "required": ["svg", "width", "height"],
                "properties": {
                    "svg": { "type": "string" },
                    "width": { "type": "integer" },
                    "height": { "type": "integer" }
                }
            }),
        },
        McpToolDefinition {
            name: "get_current_svg".into(),
            description: "获取 OpenPencil 当前文档 SVG".into(),
            input_schema: serde_json::json!({ "type": "object", "properties": {} }),
        },
        McpToolDefinition {
            name: "save_to_gallery".into(),
            description: "保存图片到图库".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "required": ["image_data", "tags"],
                "properties": {
                    "image_data": { "type": "string" },
                    "tags": { "type": "array", "items": { "type": "string" } },
                    "group_id": { "type": "string" }
                }
            }),
        },
        McpToolDefinition {
            name: "search_gallery".into(),
            description: "按标签/关键词搜索图库".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "required": ["query"],
                "properties": {
                    "query": { "type": "string" },
                    "limit": { "type": "integer" }
                }
            }),
        },
        McpToolDefinition {
            name: "get_gallery_image".into(),
            description: "按 ID 获取图库原图".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "required": ["record_id"],
                "properties": {
                    "record_id": { "type": "string" }
                }
            }),
        },
    ]
}
