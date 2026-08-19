/**
 * useResize — track window/container size reactively.
 *
 * Uses ResizeObserver when available (works inside Tauri WebView) and
 * falls back to window resize events.
 */

import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

export interface Size {
  width: number;
  height: number;
}

export interface UseResizeOptions {
  /** Whether to also observe window resize events (default true). */
  watchWindow?: boolean;
}

export interface UseResizeReturn {
  size: Readonly<Ref<Size>>;
  refresh: () => void;
}

export function useResize(target: Ref<HTMLElement | null>, opts: UseResizeOptions = {}): UseResizeReturn {
  const { watchWindow = true } = opts;
  const size = ref<Size>({ width: 0, height: 0 });

  function measure(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    size.value = { width: rect.width, height: rect.height };
  }

  function refresh() {
    if (target.value) measure(target.value);
  }

  let observer: ResizeObserver | null = null;

  function attach(el: HTMLElement) {
    measure(el);
    observer?.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => measure(el));
      observer.observe(el);
    }
  }

  function detach() {
    observer?.disconnect();
    observer = null;
  }

  onMounted(() => {
    if (target.value) attach(target.value);
  });

  onBeforeUnmount(() => {
    detach();
  });

  if (watchWindow) {
    const onWindowResize = () => {
      if (target.value) measure(target.value);
    };
    window.addEventListener('resize', onWindowResize);
    onBeforeUnmount(() => window.removeEventListener('resize', onWindowResize));
  }

  return { size: size as Readonly<Ref<Size>>, refresh };
}