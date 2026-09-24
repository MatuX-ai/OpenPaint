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
 *   - 关键词覆盖面足够宽：问候 / 快捷键 / 画布 / 画笔 / 图标 / 色板 /
 *     渐变 / 图层 / 选区 / 撤销 / 保存 / 导出 / AI 模型 / 资产 / 帮助。
 *   - 兑底引导用户切换真实大模型或继续探索可演示主题。
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

  // 6) 图层
  if (raw.includes('图层') || lower.includes('layer')) {
    return (
      '**图层面板（W12）**\n\n' +
      '• 顶部「+」「−」按钮新增 / 删除图层\n' +
      '• 拖拽图层名称可重排，选中后高亮画布上的节点\n' +
      '• 右侧「👁」切换可见性、「🔒」锁定后画布不能选中\n' +
      '• 模拟模式会演示 2 层预置画布；真实画布可通过菜单“文件 → 新建”创建'
    );
  }

  // 7) 选区 / 选择
  if (
    raw.includes('选区') ||
    raw.includes('选中') ||
    raw.includes('框选') ||
    lower.includes('select')
  ) {
    return (
      '**选区与节点操作**\n\n' +
      '• 画布上方工具栏：矩形 / 椭圆 / 套索 / 魔棒\n' +
      '• 单击节点选中，Shift 加选，拖拽多选\n' +
      '• 选中后可拖动、调整尺寸、按 Delete 删除\n' +
      '• AI 助理需要选区上下文时，从这里取节点包围盒'
    );
  }

  // 8) 撤销 / 重做
  if (
    raw.includes('撤销') ||
    raw.includes('重做') ||
    lower.includes('undo') ||
    lower.includes('redo')
  ) {
    return (
      '**历史记录**\n\n' +
      '• Ctrl+Z 撤销，Ctrl+Shift+Z (mac: ⇧⌘Z) 重做\n' +
      '• 所有操作入栈，可一直回退到初始空白画布\n' +
      '• 重复同一个动作不会压缩；AI 生成的内容也算一步'
    );
  }

  // 9) 保存 / 打开 / 导出
  if (raw.includes('保存') || lower.includes('save')) {
    return (
      '**保存与文件格式**\n\n' +
      '• Ctrl+S 保存到当前 .openpaint 文件（JSON + 资产指针）\n' +
      '• Tauri 桌面端：默认存到 ~/Documents/OpenPaint/\n' +
      '• Web 预览版：仅 LocalStorage 存草稿，刷新仍可恢复'
    );
  }
  if (raw.includes('打开') || lower.includes('open')) {
    return (
      '**打开文件**\n\n' +
      '• Ctrl+O / ⌘O 打开文件对话框\n' +
      '• 支持格式：.openpaint（原生）、.fig / .sketch（仅读，需插件）\n' +
      '• 模拟模式下展示示例文件列表，点击可装入画布'
    );
  }
  if (raw.includes('导出') || lower.includes('export') || raw.includes('下载')) {
    return (
      '**导出选项（W12）**\n\n' +
      '• PNG / JPG / SVG / PDF 四种格式\n' +
      '• 菜单「文件 → 导出」或在 TopBar 点导出图标\n' +
      '• 真实大模型生成的图会走 ai-generation-complete 事件，在 PreviewModal 中预览后再保存'
    );
  }

  // 10) 资产 / 资源
  if (raw.includes('资产') || raw.includes('资源') || lower.includes('asset')) {
    return (
      '**资产库总览**\n\n' +
      '• 图标 / 色板 / 渐变：见右侧面板\n' +
      '• 笔刷预设：见左侧工具栏底部\n' +
      '• 字体：内置 Inter 5 个字重 + NotoNaskhArabic 回退\n' +
      '• 自定义资产：放到 assets/ 对应子目录即可被自动加载'
    );
  }

  // 11) 主题 / 设置 / 偏好
  if (
    raw.includes('主题') ||
    lower.includes('theme') ||
    raw.includes('暗色') ||
    raw.includes('亮色')
  ) {
    return (
      '**主题切换**\n\n' +
      '• 顶部菜单「查看 → 主题」切换 Light / Dark\n' +
      '• 偏好面板里也能改默认主题\n' +
      '• 记忆到 LocalStorage，跨设备不会同步'
    );
  }
  if (
    raw.includes('设置') ||
    raw.includes('偏好') ||
    raw.includes('配置') ||
    lower.includes('setting') ||
    lower.includes('preference')
  ) {
    return (
      '**偏好 / 高级设置**\n\n' +
      '• QuickPreferences：3 项最常用项（主题 / 默认 LLM / 快捷键覆盖）\n' +
      '• AdvancedSettings：完整面板，含模型 Provider、Key、速率限制、遥测\n' +
      '• TopBar 齿轮图标打开 QuickPreferences；点“高级设置…”跳到完整面板'
    );
  }

  // 12) 模型 / 配置
  if (
    raw.includes('大模型') ||
    raw.includes('LLM') ||
    raw.includes('AI 模型') ||
    raw.includes('Provider')
  ) {
    return (
      '**支持的 LLM Provider**（共 10 家，模拟模式置顶）\n\n' +
      '• 模拟模式（本对话正在用，零配置）\n' +
      '• 国内：DeepSeek / 通义千问 / 智谱 GLM / 月之暗面 Kimi / 豆包 / MiniMax\n' +
      '• 海外：OpenAI / Anthropic Claude\n' +
      '• 本地：Ollama（完全离线）\n\n' +
      '切换：右下角**偏好 → AI 模型**，自配 API Key 即可。'
    );
  }

  // 13) 帮助 / 帮助指令
  if (
    raw.includes('帮助') ||
    raw.includes('help') ||
    raw.includes('能做什么') ||
    raw.includes('怎么用') ||
    raw.includes('说明')
  ) {
    return (
      '**我能演示什么**（模拟模式）\n\n' +
      '• 介绍快捷键 / 画布 / 图层 / 选区 / 画笔\n' +
      '• 介绍资产库（图标 / 色板 / 渐变 / 笔刷）\n' +
      '• 介绍 LLM Provider 配置 / 主题 / 偏好\n' +
      '• 其他问题会落到兑底回复，需要真能力请切换真实模型\n\n' +
      '试试依次问：「快捷键」「画布」「图标」「大模型」。'
    );
  }

  // 14) 兑底
  const snippet = Array.from(raw).slice(0, 40).join('');
  return (
    `我理解你想了解「${snippet}」。当前是**模拟模式**，我能演示有限的快捷键 / 画布 / 资产库内容。试试：\n\n` +
    '• 「快捷键」 查看速查\n' +
    '• 「画布」 了解工具\n' +
    '• 「图层」 了解图层面板\n' +
    '• 「选区」 了解选区与节点操作\n' +
    '• 「图标 / 色板 / 渐变」 看资产库\n' +
    '• 「保存 / 打开 / 导出」 看文件操作\n' +
    '• 「大模型」 看支持的 Provider\n' +
    '• 「帮助」 查看我能演示什么\n\n' +
    '要处理更复杂任务，在右下角**偏好 → AI 模型**切到 DeepSeek / 通义千问 / OpenAI 等真实 Provider。'
  );
}
