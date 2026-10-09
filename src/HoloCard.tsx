/*
 * A React port of Card.svelte from pokemon-cards-css by Simon Goellner
 * (simeydotme), GPL-3.0: https://github.com/simeydotme/pokemon-cards-css
 * (commit acb1197). See ./LICENSE. This file is GPL-3.0 as a derivative.
 *
 * Kept from the original: the spring settings, the pointer maths, the
 * custom properties the effect stylesheets read, the snap back after the
 * pointer leaves, the popover (centre, scale, one turn on the first pop),
 * and the retreat.
 *
 * Changed in this port (2026-10-07):
 * - React instead of Svelte; which card is active comes from the parent.
 * - The face is HTML passed as children instead of a card image.
 * - The card face is laid out 640px wide and scaled DOWN into its slot, and
 *   the popover never scales above 1, so it stays sharp up close.
 * - A card can lie face down and turn over in place (faceUp); only a
 *   face-up card comes up close.
 * - No showcase spin, and the pointer stays a plain hand.
 * - No analytics, no device orientation.
 * - The snap back is damped instead of bouncy (2026-10-09): the original's
 *   wobble swung --card-opacity below zero and back several times before it
 *   settled. Opacity is clamped to 0..1 as well.
 * - A card stays lifted (data-lifted) until it has landed back in its slot,
 *   so it never drops under its neighbours halfway home.
 * - Cards can share one pointer (link): on the deck, every card in the pile
 *   tilts together.
 */

import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { springTo, type SpringOpts } from "./spring";
import "./css/base.css";
import "./css/cards.css";
import "./css/v-regular.css";
import "./css/cosmos-holo.css";
import "./css/rainbow-alt.css";
import "./css/regular-holo.css";
import "./css/secret-rare.css";
import "./css/radiant-holo.css";
import "./holo-lab.css";

export const CARD_W = 640;
const CARD_H = CARD_W / 0.718;

const clamp = (v: number, min = 0, max = 100) => Math.min(Math.max(v, min), max);
const round = (v: number, p = 3) => parseFloat(v.toFixed(p));
const adjust = (v: number, fMin: number, fMax: number, tMin: number, tMax: number) =>
  round(tMin + ((tMax - tMin) * (v - fMin)) / (fMax - fMin));

const INTERACT: SpringOpts = { stiffness: 0.066, damping: 0.25 };
const POPOVER: SpringOpts = { stiffness: 0.033, damping: 0.45 };
const SNAP: SpringOpts = { stiffness: 0.03, damping: 0.4 };

/** One pointer shared by several cards: what one card hears, all of them do. */
export type Percent = { x: number; y: number };
export interface PointerLink {
  emit: (p: Percent | null) => void;
  on: (f: (p: Percent | null) => void) => () => void;
}
export function createLink(): PointerLink {
  const subs = new Set<(p: Percent | null) => void>();
  return {
    emit: (p) => subs.forEach((f) => f(p)),
    on: (f) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
  };
}

export function HoloCard({
  id,
  rarity,
  active,
  onToggle,
  width,
  faceUp = true,
  label,
  front,
  extraStyle,
  windowed = false,
  back = "grid",
  link,
}: {
  id: string;
  /** The original's rarity string, e.g. "rare holo v". Picks the effect. */
  rarity: string;
  active: boolean;
  onToggle: (id: string) => void;
  /** How wide the card shows in its slot, in px. */
  width: number;
  /** Face down shows the back; turning it over happens in place. */
  faceUp?: boolean;
  label: string;
  /** Layers for the card face. Anything with the class card__shine or
      card__glare is styled by the effect stylesheets. */
  front: ReactNode;
  extraStyle?: CSSProperties;
  /** Keep the foil inside the art window (--clip). */
  windowed?: boolean;
  /** Which card back (holo-lab.css, .gh-back). */
  back?: string;
  /** Share the pointer with other cards (the deck). */
  link?: PointerLink;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const seed = useRef({ x: Math.random(), y: Math.random() });

  /* The springs, as in the original. */
  const rotate = useRef(springTo({ x: 0, y: 0 }, INTERACT));
  const glare = useRef(springTo({ x: 50, y: 50, o: 0 }, INTERACT));
  const background = useRef(springTo({ x: 50, y: 50 }, INTERACT));
  const rotateDelta = useRef(springTo({ x: faceUp ? 0 : 180, y: 0 }, POPOVER));
  const faceUpRef = useRef(faceUp);
  faceUpRef.current = faceUp;
  const translate = useRef(springTo({ x: 0, y: 0 }, POPOVER));
  const scale = useRef(springTo({ s: 0.35 }, POPOVER));
  const rest = useRef(0);
  const firstPop = useRef(true);
  const activeRef = useRef(active);
  activeRef.current = active;
  const pending = useRef<null | { b: { x: number; y: number }; r: { x: number; y: number }; g: { x: number; y: number; o: number } }>(null);
  const raf = useRef(0);
  const endTimer = useRef(0);

  /* Write the springs into the custom properties the stylesheets read. */
  const write = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    const g = glare.current.value;
    const r = rotate.current.value;
    const rd = rotateDelta.current.value;
    const b = background.current.value;
    const t = translate.current.value;
    const st = el.style;
    st.setProperty("--pointer-x", `${g.x}%`);
    st.setProperty("--pointer-y", `${g.y}%`);
    st.setProperty("--pointer-from-center", `${clamp(Math.sqrt((g.y - 50) ** 2 + (g.x - 50) ** 2) / 50, 0, 1)}`);
    st.setProperty("--pointer-from-top", `${g.y / 100}`);
    st.setProperty("--pointer-from-left", `${g.x / 100}`);
    st.setProperty("--card-opacity", `${clamp(g.o, 0, 1)}`);
    st.setProperty("--rotate-x", `${r.x + rd.x}deg`);
    st.setProperty("--rotate-y", `${r.y + rd.y}deg`);
    st.setProperty("--background-x", `${b.x}%`);
    st.setProperty("--background-y", `${b.y}%`);
    st.setProperty("--card-scale", `${scale.current.value.s}`);
    st.setProperty("--translate-x", `${t.x}px`);
    st.setProperty("--translate-y", `${t.y}px`);
    /* Landed: only now may it go back under its neighbours. */
    const slot = slotRef.current;
    if (slot?.dataset.lifted === "true" && !activeRef.current) {
      const home = Math.abs(t.x) < 0.5 && Math.abs(t.y) < 0.5 && Math.abs(scale.current.value.s - rest.current) < 0.002;
      if (home) slot.dataset.lifted = "false";
    }
  }, []);

  useEffect(() => {
    const springs = [rotate, glare, background, rotateDelta, translate, scale].map((s) => s.current);
    const unsub = springs.map((s) => s.subscribe(write));
    write();
    return () => unsub.forEach((u) => u());
  }, [write]);

  const setAll = useCallback((opts: SpringOpts) => {
    for (const s of [rotate, glare, background]) s.current.configure(opts);
  }, []);

  const interactEnd = useCallback(
    (delay = 500) => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
      pending.current = null;
      window.clearTimeout(endTimer.current);
      endTimer.current = window.setTimeout(() => {
        setAll(SNAP);
        rotate.current.set({ x: 0, y: 0 }, { soft: 1 });
        glare.current.set({ x: 50, y: 50, o: 0 }, { soft: 1 });
        background.current.set({ x: 50, y: 50 }, { soft: 1 });
      }, delay);
    },
    [setAll],
  );

  const apply = useCallback(
    (percent: Percent) => {
      window.clearTimeout(endTimer.current);
      const center = { x: percent.x - 50, y: percent.y - 50 };
      pending.current = {
        b: { x: adjust(percent.x, 0, 100, 37, 63), y: adjust(percent.y, 0, 100, 33, 67) },
        r: { x: round(-(center.x / 3.5)), y: round(center.y / 3.5) },
        g: { x: round(percent.x), y: round(percent.y), o: 1 },
      };
      if (!raf.current) {
        raf.current = requestAnimationFrame(() => {
          raf.current = 0;
          const p = pending.current;
          if (!p) return;
          setAll(INTERACT);
          background.current.set(p.b);
          rotate.current.set(p.r);
          glare.current.set(p.g);
          pending.current = null;
        });
      }
    },
    [setAll],
  );

  const interact = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const percent = {
        x: clamp(round((100 / rect.width) * (e.clientX - rect.left))),
        y: clamp(round((100 / rect.height) * (e.clientY - rect.top))),
      };
      if (link) link.emit(percent);
      else apply(percent);
    },
    [apply, link],
  );
  const leave = useCallback(() => {
    if (link) link.emit(null);
    else interactEnd();
  }, [interactEnd, link]);
  useEffect(() => {
    if (!link) return;
    return link.on((p) => (p ? apply(p) : interactEnd()));
  }, [link, apply, interactEnd]);

  /* Rest scale: what fits the slot. */
  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect().width / CARD_W;
      const first = rest.current === 0;
      rest.current = r;
      if (activeRef.current) return;
      scale.current.set({ s: r }, first ? { hard: true } : {});
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Popover and retreat, as in the original. */
  useEffect(() => {
    if (active) {
      if (slotRef.current) slotRef.current.dataset.lifted = "true";
      const card = cardRef.current!;
      const rect = card.getBoundingClientRect();
      const view = document.documentElement;
      translate.current.set({
        x: round(view.clientWidth / 2 - rect.x - rect.width / 2),
        y: round(view.clientHeight / 2 - rect.y - rect.height / 2),
      });
      let delay = 100;
      if (firstPop.current) {
        delay = 1000;
        rotateDelta.current.set({ x: 360, y: 0 });
      }
      firstPop.current = false;
      scale.current.set({ s: Math.min((window.innerWidth * 0.9) / CARD_W, (window.innerHeight * 0.9) / CARD_H, 1) });
      interactEnd(delay);
    } else {
      scale.current.set({ s: rest.current || scale.current.value.s }, { soft: true });
      translate.current.set({ x: 0, y: 0 }, { soft: true });
      rotateDelta.current.set({ x: faceUpRef.current ? 0 : 180, y: 0 }, { soft: true });
      interactEnd(100);
    }
  }, [active, interactEnd]);

  /* Turning over, in place: a quick spin with a little overshoot. */
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    /* The turn is the show; no extra spin on its first close-up. */
    if (faceUp) firstPop.current = false;
    rotateDelta.current.configure({ stiffness: 0.06, damping: 0.32 });
    rotateDelta.current.set({ x: faceUp ? 0 : 180, y: 0 });
    const t = window.setTimeout(() => rotateDelta.current.configure(POPOVER), 1400);
    return () => window.clearTimeout(t);
  }, [faceUp]);

  return (
    <div ref={slotRef} className="gh-slot" style={{ width }} data-active={active} data-lifted="false">
      <div
        ref={cardRef}
        className={`card interactive${active ? " active interacting" : ""}${windowed ? " gh-windowed" : ""}`}
        data-face={faceUp ? "up" : "down"}
        data-rarity={rarity}
        data-subtypes="basic"
        data-supertype="pokémon"
        style={
          {
            "--seedx": seed.current.x,
            "--seedy": seed.current.y,
            "--cosmosbg": `${Math.floor(seed.current.x * 734)}px ${Math.floor(seed.current.y * 1280)}px`,
            ...extraStyle,
          } as CSSProperties
        }
      >
        <div className="card__translater">
          <button
            type="button"
            className="card__rotator"
            onClick={() => onToggle(id)}
            onPointerMove={interact}
            onPointerLeave={leave}
            aria-label={!faceUp ? `Turn over a card` : active ? `${label}. Put it back` : `${label}. Take a closer look`}
          >
            <div className="card__back">
              <span className="gh-back" data-back={back} />
            </div>
            <div className="card__front">{front}</div>
          </button>
        </div>
      </div>
    </div>
  );
}
