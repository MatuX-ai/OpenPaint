/**
 * Tauri 事件统一管理
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/** 事件类型映射 */
type EventMap = {
  'ai-generation-complete': { svg: string; png: string };
  'ai-generation-progress': { progress: number };
  'canvas-updated': { layerId: string };
  'gallery-updated': { count: number };
  'mcp-status-changed': { status: 'connected' | 'disconnected' };
};

class EventManager {
  private listeners: Map<keyof EventMap, UnlistenFn[]> = new Map();

  /** 订阅事件 */
  async on<K extends keyof EventMap>(
    event: K,
    callback: (payload: EventMap[K]) => void,
  ): Promise<UnlistenFn> {
    const unlisten = await listen(event, (e) => callback(e.payload as EventMap[K]));
    const list = this.listeners.get(event) ?? [];
    list.push(unlisten);
    this.listeners.set(event, list);
    return unlisten;
  }

  /** 清除全部事件监听 */
  async clearAll(): Promise<void> {
    for (const [, unlistens] of this.listeners) {
      for (const unlisten of unlistens) {
        unlisten();
      }
    }
    this.listeners.clear();
  }
}

export const eventManager = new EventManager();
