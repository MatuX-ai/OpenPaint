/**
 * 格式化工具
 */

/**
 * 格式化 Unix 时间戳为可读字符串
 */
export function formatTimestamp(ts: number, locale = 'zh-CN'): string {
  return new Date(ts).toLocaleString(locale);
}

/**
 * 格式化相对时间（如"3 分钟前"）
 */
export function formatRelative(ts: number, _locale = 'zh-CN'): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} 天前`;
  if (hours > 0) return `${hours} 小时前`;
  if (minutes > 0) return `${minutes} 分钟前`;
  return '刚刚';
}

/**
 * 格式化文件大小
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
