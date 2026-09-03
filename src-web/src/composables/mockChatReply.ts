/**
 * mockChatReply — W12 VDP-MOCK-03 前端版本地规则模板。
 *
 * 与 src-tauri/src/tools/ai_commands.rs::mock_chat_reply 行为一致，
 * 用于：
 *   1. useAgent.send 在 isMock 模式下直接返回（不发 IPC）
 *   2. Web 端 / Tauri 不可用时的兜底回复
 *
 * 设计原则：
 *   - 不假装是真人 AI，每次回复都标明"模拟模式"
 *   - 返回有教育价值的真实信息（快捷键 / 画布 / 资产库）
 *   - 兜底引导用户切换真实大模型或继续探索可演示主题
 */

export function mockChatReply(message: string): string {
  const raw = message.trim();
  const lower = raw.toLowerCase();

  // 1) 问候
  if (
    lower.startsWith('hi') ||
    lower.startsWith('hello') ||
    lower.startsWith('hey') ||
    raw.includes('你好') ||
    raw.includes('您好')
  ) {
    return (
      '你好！我是 OpenPaint 的 **模拟 AI 助手**。\n\n' +
      '• 不联网、不计费，0 延迟回复\n' +
      '• 可演示：快捷键、画布工具、图标/色板/渐变资产库入口\n' +
      '• 不支持：复杂生成、图像理解、多轮工具调用\n\n' +
      '试试问我「介绍一下快捷键」或「画笔有几种」。要更强能力？在右下角打开**偏好 → AI 模型**切换即可。'
    );
  }

  // 2) 快捷键
  if (raw.includes('快捷键') || lower.includes('shortcut') || raw.includes('速查') || raw === '?') {
    return (
      '**OpenPaint 常用快捷键**\n\n' +
      '| 操作 | Win/Linux | macOS |\n' +
      '| --- | --- | --- |\n' +
      '| 新建 | Ctrl + N | ⌘ + N |\n' +
      '| 打开 | Ctrl + O | ⌘ + O |\n' +
      '| 保存 | Ctrl + S | ⌘ + S |\n' +
      '| 撤销 | Ctrl + Z | ⌘ + Z |\n' +
      '| 重做 | Ctrl + Shift + Z | ⇧⌘ + Z |\n' +
      '| 速查面板 | ? | ? |\n\n' +
      '随时按 ? 唤起完整速查。'
    );
  }

  // 3) 画布
  if (raw.includes('画布') || lower.includes('canvas')) {
    return (
      '中央画布支持：\n\n' +
      '• **图层**：添加 / 删除 / 重排 / 锁定 / 可见性切换\n' +
      '• **选区**：矩形 / 椭圆 / 套索 / 魔棒\n' +
      '• **工具**：画笔 / 橡皮 / 填充 / 渐变 / 文字\n' +
      '• **历史**：无限撤销，所有操作可还原\n\n' +
      '试试左侧工具栏画一笔，或按 B 切换画笔。'
    );
  }

  // 4) 画笔
  if (raw.includes('画笔') || raw.includes('笔刷') || lower.includes('brush')) {
    return (
      '**画笔系统（v0.2）**\n\n' +
      '• 9 种内置笔刷：圆头 / 铅笔 / 水彩 / 马克笔 / 喷枪 / 蜡笔 / 钢笔 / 毛笔 / 像素\n' +
      '• 尺寸、硬度、不透明度、流量可调\n' +
      '• 笔刷预设保存到 assets/brushes/\n\n' +
      'AI 笔刷生成（描述一句话自动创建笔刷）将在 v0.3 上线。'
    );
  }

  // 5) 图标 / 色板 / 渐变
  if (raw.includes('图标') || lower.includes('icon')) {
    return (
      '**图标资产库**\n\n' +
      '• 内置 200+ 图标（基于 Iconify 聚合，按 lucide / material / tabler 等集分类）\n' +
      '• 右侧「图标」面板可直接拖入画布\n' +
      '• 模拟模式下无法调用 search_icons 工具；配置真实大模型后可以"按描述搜图标"\n\n' +
      '资产路径：`src-web/src/components/iconify/`。'
    );
  }
  if (raw.includes('色板') || raw.includes('调色板') || lower.includes('palette')) {
    return (
      '**色板资产库**\n\n' +
      '• 4 套内置：Material / Tailwind / Pastel / Mono\n' +
      '• 右侧「色板」面板可一键应用到选区或整个图层\n' +
      '• 自定义色板：JSON 放在 assets/palettes/ 即可被自动加载'
    );
  }
  if (raw.includes('渐变') || lower.includes('gradient')) {
    return (
      '**渐变资产库**\n\n' +
      '• 内置 6 种：linear-sunset / radial-glow / conic-rainbow / linear-ocean / radial-mint / mono-step\n' +
      '• 右侧「渐变」面板可填充到形状或文字\n' +
      '• 自定义渐变：YAML 放在 assets/gradients/ 即可'
    );
  }

  // 6) 模型 / 配置
  if (raw.includes('大模型') || raw.includes('LLM') || raw.includes('AI 模型')) {
    return (
      '**支持的 LLM Provider**（共 10 家，模拟模式置顶）\n\n' +
      '• 模拟模式（本对话正在用，零配置）\n' +
      '• 国内：DeepSeek / 通义千问 / 智谱 GLM / 月之暗面 Kimi / 豆包 / MiniMax\n' +
      '• 海外：OpenAI / Anthropic Claude\n' +
      '• 本地：Ollama（完全离线）\n\n' +
      '切换：右下角**偏好 → AI 模型**，自配 API Key 即可。'
    );
  }

  // 兜底
  const snippet = Array.from(raw).slice(0, 40).join('');
  return (
    `我理解你想了解「${snippet}」。当前是**模拟模式**，我能演示有限的快捷键 / 画布 / 资产库内容。试试：\n\n` +
    '• 「快捷键」 查看速查\n' +
    '• 「画布」 了解工具\n' +
    '• 「图标 / 色板 / 渐变」 看资产库\n' +
    '• 「大模型」 看支持的 Provider\n\n' +
    '要处理更复杂任务，在右下角**偏好 → AI 模型**切到 DeepSeek / 通义千问 / OpenAI 等真实 Provider。'
  );
}
