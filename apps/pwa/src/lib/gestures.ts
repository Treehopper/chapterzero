/**
 * One Pointer Events recogniser for the study stage (README §8.1 "Gesture engine", C2, C10–C12).
 * Axis is fixed after 10 px by the dominant direction; horizontal = grade, vertical = overlays.
 */
export interface GestureHandlers {
  onTap?: (e: PointerEvent) => void;
  onDragX?: (dx: number) => void;
  onSwipeX?: (dir: 1 | -1) => void;
  onSwipeY?: (dir: 1 | -1) => void; // 1 = down
  onCancel?: () => void;
  /** width used for the 30 % threshold (the card's width) */
  width?: () => number;
}

export const AXIS_LOCK_PX = 10;
export const EDGE_GUARD_PX = 44;
export const COMMIT_FRACTION = 0.3;
export const COMMIT_VELOCITY = 0.5; // px/ms
export const VERTICAL_COMMIT_PX = 48;

export function gestures(node: HTMLElement, handlers: GestureHandlers) {
  let h = handlers;
  let id: number | null = null;
  let sx = 0, sy = 0, st = 0;
  let axis: 'x' | 'y' | 'none' | null = null;
  let samples: { x: number; y: number; t: number }[] = [];

  const velocity = () => {
    if (samples.length < 2) return { vx: 0, vy: 0 };
    const a = samples[0], b = samples[samples.length - 1];
    const dt = Math.max(1, b.t - a.t);
    return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
  };

  function down(e: PointerEvent) {
    if (id !== null || e.button > 0) return;
    if ((e.target as Element).closest('a, button, input, textarea, select, [data-nogesture]')) return;
    id = e.pointerId;
    sx = e.clientX; sy = e.clientY; st = e.timeStamp;
    axis = null;
    samples = [{ x: sx, y: sy, t: st }];
    try { node.setPointerCapture?.(e.pointerId); } catch { /* synthetic or already released pointer */ }
  }

  function move(e: PointerEvent) {
    if (e.pointerId !== id) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (samples.length > 5) samples.shift();
    if (axis === null && Math.hypot(dx, dy) > AXIS_LOCK_PX) {
      axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      // vertical swipes near the screen edges belong to iOS (C10–C14)
      if (axis === 'y' && (sy < EDGE_GUARD_PX || sy > window.innerHeight - EDGE_GUARD_PX)) axis = 'none';
    }
    if (axis === 'x') h.onDragX?.(dx);
  }

  function up(e: PointerEvent) {
    if (e.pointerId !== id) return;
    id = null;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    const { vx, vy } = velocity();
    if (axis === null) {
      if (e.timeStamp - st < 700) h.onTap?.(e);
      return;
    }
    if (axis === 'x') {
      const w = h.width?.() ?? node.clientWidth;
      if (Math.abs(dx) > w * COMMIT_FRACTION || (Math.abs(vx) > COMMIT_VELOCITY && Math.sign(vx) === Math.sign(dx))) h.onSwipeX?.(dx > 0 ? 1 : -1);
      else h.onCancel?.();
      return;
    }
    if (axis === 'y') {
      if (Math.abs(dy) > VERTICAL_COMMIT_PX || (Math.abs(vy) > COMMIT_VELOCITY && Math.sign(vy) === Math.sign(dy))) h.onSwipeY?.(dy > 0 ? 1 : -1);
      else h.onCancel?.();
    }
  }

  function cancel(e: PointerEvent) {
    if (e.pointerId !== id) return;
    id = null;
    if (axis === 'x') h.onCancel?.();
  }

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', cancel);
  return {
    update(next: GestureHandlers) { h = next; },
    destroy() {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', cancel);
    },
  };
}
