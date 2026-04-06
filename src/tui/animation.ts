type Tween = {
  start: number;
  target: number;
  startTime: number;
  dur: number;
  set: (v: number) => void;
};

const tweens = new Set<Tween>();

setInterval(() => {
  if (tweens.size === 0) return;
  const now = Date.now();
  for (const t of tweens) {
    const progress = Math.min((now - t.startTime) / t.dur, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    t.set(t.start + (t.target - t.start) * eased);
    if (progress >= 1) tweens.delete(t);
  }
}, 16);

/** Register a tween. Returns a cancel function. */
export function animateTo(
  start: number,
  target: number,
  set: (v: number) => void,
  dur = 450,
): () => void {
  const tween: Tween = { start, target, startTime: Date.now(), dur, set };
  tweens.add(tween);
  return () => tweens.delete(tween);
}
