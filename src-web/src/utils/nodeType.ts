/** Runtime guards for OpenPencil node types that TS unions may omit. */

export function isPageNode(node: { type?: string } | null | undefined): boolean {
  return Boolean(node && node.type === 'PAGE');
}
