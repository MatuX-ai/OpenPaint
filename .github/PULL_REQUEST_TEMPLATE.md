<!--
感谢你的贡献！

请确保 PR 标题遵循 Conventional Commits 规范：
<type>(<scope>): <subject>

例如：feat(canvas): add magic wand selection with tolerance

类型：feat | fix | docs | style | refactor | perf | test | chore
范围：canvas | agent | gallery | frontend | tools | build | docs | ci
-->

## 变更说明

<!-- 描述本次 PR 的目的与实现思路 -->

## 关联 Issue

<!-- 使用 Closes #123 / Fixes #123 / Refs #123 关联 -->

Closes #

## 变更类型（必勾）

- [ ] 新功能（feat）
- [ ] Bug 修复（fix）
- [ ] 重构（refactor）
- [ ] 性能优化（perf）
- [ ] 文档更新（docs）
- [ ] 测试（test）
- [ ] 构建/CI（chore/ci）
- [ ] 样式（style）

## 涉及模块（必勾）

- [ ] 画布（canvas）
- [ ] AI 助理（agent）
- [ ] OpenPencil
- [ ] 图库（gallery）
- [ ] 工具（tools）
- [ ] 前端 UI（frontend）
- [ ] 配置（config）
- [ ] 构建/打包（build）
- [ ] 文档（docs）

## 测试结果

### 自动化测试

- [ ] `pnpm lint` 通过
- [ ] `pnpm type-check` 通过
- [ ] `pnpm test:unit` 通过
- [ ] `cargo fmt --check` 通过
- [ ] `cargo clippy` 通过
- [ ] `cargo test` 通过

### 人工测试（如涉及 UI 或端到端）

<!-- 描述测试场景与结果 -->

**场景**：<!-- 例如：选图 → AI 生成 → 落回画布 -->
**结果**：<!-- 例如：通过，耗时 X 秒 -->
**截图/录屏**：<!-- 附图链接 -->

## 文档同步

- [ ] 接口变更已更新 `docs/api.md`
- [ ] 配置文件变更已更新 `assets/default_config.yaml`
- [ ] 用户文档已更新（如行为变化）
- [ ] CHANGELOG 待自动生成

## Checklist（必勾）

- [ ] 我已阅读 CONTRIBUTING.md 并遵守其中的规范
- [ ] 我已添加/修改相应的单元测试
- [ ] 我已确认没有引入新的依赖警告
- [ ] 我已附上相关截图或录屏（如涉及 UI）
- [ ] 我已 review 自己的代码

## 附加说明

<!-- 其他需要 Reviewer 关注的内容 -->