// ============================================================
// AI 助理 / Agent 类型定义
// ============================================================

/** 聊天消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/** 单条聊天消息 */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  /** 工具调用（assistant 消息） */
  toolCalls?: ToolCall[];
}

/** 工具调用 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: string;
  error?: string;
}

/** AI 上下文（系统提示中注入） */
export interface AgentContext {
  hasSelection: boolean;
  activeLayerId: string | null;
  canvasWidth: number;
  canvasHeight: number;
}