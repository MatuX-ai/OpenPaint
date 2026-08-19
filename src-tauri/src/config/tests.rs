//! 配置模块单元测试

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_data_dir_path() {
        let dir = config::data_dir();
        assert!(dir.is_ok());
        let path = dir.unwrap();
        // 路径应以 .openpaint 结尾
        assert!(path.ends_with(".openpaint"));
    }

    #[test]
    fn test_config_yaml_is_valid() {
        let yaml = include_str!("../../assets/default_config.yaml");
        let parsed: Result<config::AppConfig, _> = serde_yaml::from_str(yaml);
        assert!(parsed.is_ok(), "默认配置 YAML 必须可解析");
    }

    #[test]
    fn test_preset_sizes_match() {
        // Rust 常量必须与 YAML 保持一致
        assert_eq!(config::preset::WEB_SIZES, &[16, 32, 48, 180, 192, 512]);
        assert_eq!(
            config::preset::IOS_SIZES,
            &[20.0, 29.0, 40.0, 60.0, 76.0, 83.5, 1024.0]
        );
    }
}