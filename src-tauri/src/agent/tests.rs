//! MCP 工具定义单元测试

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_definitions_count() {
        let tools = agent::mcp::tool_definitions();
        // W9 + 2 (search_icons / render_icon_svg)
        // W10 + 2 (apply_palette / apply_gradient)
        // W11 + 1 stub (create_brush_from_prompt)
        // 总计 = 15
        assert_eq!(tools.len(), 15, "原子工具数应 = 15 (W11 完工后)");
    }

    #[test]
    fn test_all_tools_have_required_fields() {
        let tools = agent::mcp::tool_definitions();
        for tool in tools {
            assert!(!tool.name.is_empty(), "工具名称不能为空");
            assert!(!tool.description.is_empty(), "工具描述不能为空");
            assert!(tool.input_schema.is_object(), "工具 schema 必须是对象");
        }
    }

    #[test]
    fn test_specific_tool_exists() {
        let tools = agent::mcp::tool_definitions();
        let names: Vec<&str> = tools.iter().map(|t| t.name.as_str()).collect();

        // 必须包含的 10 个核心工具
        let required = [
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
        ];

        for name in required {
            assert!(names.contains(&name), "缺少工具: {}", name);
        }
    }

    #[test]
    fn test_w9_w10_w11_tools_present() {
        let tools = agent::mcp::tool_definitions();
        let names: Vec<&str> = tools.iter().map(|t| t.name.as_str()).collect();
        for name in [
            "search_icons",
            "render_icon_svg",
            "apply_palette",
            "apply_gradient",
            "create_brush_from_prompt",
        ] {
            assert!(names.contains(&name), "缺少资产库工具: {}", name);
        }
    }
}