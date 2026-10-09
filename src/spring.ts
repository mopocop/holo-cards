/*
 * A small port of Svelte's `spring` store (svelte/motion, MIT licence,
 * https://github.com/sveltejs/svelte), so the holo card port moves with the
 * exact same stiffness, damping and "soft" behaviour as the original.
 * Works on flat objects of numbers.
 */

export interface SpringOpts {
  stiffness: number;
  damping: number;
  precision?: number;
}
type Vec = Record<string, number>;

export function springTo<T extends Vec>(initial: T, opts: SpringOpts) {
  let o = { precision: 0.01, ...opts };
  let value = { ...initial } as T;
  let last = { ...initial } as T;
  let target = { ...initial } as T;
  let invMass = 1;
  let recovery = 0;
  let lastTime = 0;
  let frame = 0;
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());

  const tick = (now: number) => {
    invMass = Math.min(invMass + recovery, 1);
    const dt = ((now - lastTime) * 60) / 1000;
    let settled = true;
    const next = {} as Vec;
    for (const k in target) {
      const delta = target[k] - value[k];
      const velocity = (value[k] - last[k]) / (dt || 1 / 60);
      const spring = o.stiffness * delta;
      const damper = o.damping * velocity;
      const acceleration = (spring - damper) * invMass;
      const d = (velocity + acceleration) * dt;
      if (Math.abs(d) < o.precision && Math.abs(delta) < o.precision) {
        next[k] = target[k];
      } else {
        settled = false;
        next[k] = value[k] + d;
      }
    }
    lastTime = now;
    last = value;
    value = next as T;
    emit();
    frame = settled ? 0 : requestAnimationFrame(tick);
  };

  return {
    get value() {
      return value;
    },
    configure(next: SpringOpts) {
      o = { precision: 0.01, ...next };
    },
    set(next: Partial<T>, opts: { hard?: boolean; soft?: boolean | number } = {}) {
      target = { ...target, ...next } as T;
      if (opts.hard || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        cancelAnimationFrame(frame);
        frame = 0;
        value = { ...target };
        last = { ...target };
        emit();
        return;
      }
      if (opts.soft) {
        const rate = opts.soft === true ? 0.5 : +opts.soft;
        recovery = 1 / (rate * 60);
        invMass = 0;
      }
      if (!frame) {
        lastTime = performance.now();
        frame = requestAnimationFrame(tick);
      }
    },
    subscribe(cb: () => void) {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
  };
}
