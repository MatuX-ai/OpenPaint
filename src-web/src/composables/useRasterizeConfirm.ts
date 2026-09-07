/**
 * Shared confirm flow for vector → pixel conversion.
 * Session-scoped: after the user confirms a node once, skip re-prompt for that id.
 */

import { ref } from 'vue';

export interface RasterizeConfirmRequest {
  nodeIds: string[];
  label: string;
}

const open = ref(false);
const request = ref<RasterizeConfirmRequest | null>(null);
let resolver: ((ok: boolean) => void) | null = null;

/** Node ids the user already agreed to convert this session. */
const confirmedIds = new Set<string>();

export function useRasterizeConfirmState() {
  return { open, request };
}

export function needsRasterizeConfirm(nodeIds: string[]): boolean {
  return nodeIds.some((id) => !confirmedIds.has(id));
}

export function markRasterizeConfirmed(nodeIds: string[]): void {
  for (const id of nodeIds) confirmedIds.add(id);
}

/**
 * Open the confirm dialog. Resolves true if the user accepts conversion.
 * If every id was already confirmed this session, resolves true immediately.
 */
export function requestRasterizeConfirm(payload: RasterizeConfirmRequest): Promise<boolean> {
  if (payload.nodeIds.length === 0) return Promise.resolve(false);
  if (!needsRasterizeConfirm(payload.nodeIds)) return Promise.resolve(true);

  // Replace any in-flight prompt
  if (resolver) {
    resolver(false);
    resolver = null;
  }

  return new Promise<boolean>((resolve) => {
    resolver = resolve;
    request.value = payload;
    open.value = true;
  });
}

export function decideRasterizeConfirm(ok: boolean): void {
  if (ok && request.value) {
    markRasterizeConfirmed(request.value.nodeIds);
  }
  open.value = false;
  const r = resolver;
  resolver = null;
  request.value = null;
  r?.(ok);
}

/** Test helper */
export function __resetRasterizeConfirmForTests(): void {
  confirmedIds.clear();
  open.value = false;
  request.value = null;
  if (resolver) {
    resolver(false);
    resolver = null;
  }
}
