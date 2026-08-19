//! MCP 工具定义单元测试

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_definitions_count() {
        let tools = agent::mcp::tool_definitions();
        assert_eq!(tools.len(), 10, "应当正好 10 个原子工具");
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
}