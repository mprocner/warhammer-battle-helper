import { planThrows, labelColorFor } from './dicePlan';
import { createDiceSound } from './diceSound';

// Wraps @3d-dice/dice-box-threejs (pinned to 0.0.12, see PLAYRPG-342) so the rest of the app
// never touches it. The library has sharp edges this module exists to contain:
// - a roll() or clearDice() while dice are still moving leaves the running roll's promise
//   pending forever (upstream #19), hence the strict one-at-a-time queue;
// - it has no destroy (upstream #11), hence teardown();
// - it ignores devicePixelRatio and never resizes itself;
// - the values it reports back can be wrong (upstream #12) — the result always comes from
//   the server, nothing here reads it back.

const defaultLoadLibrary = () => import(/* webpackChunkName: "dice-3d" */ '@3d-dice/dice-box-threejs');

const defaultSupportsWebGL = () => {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
};

const BOX_CONFIG = {
  assetPath: '/',
  sounds: false, // our own sound module plays the hits, see diceSound.js
  shadows: true,
  theme_surface: 'green-felt', // only picks the (unused) surface sound set; the felt itself is not drawn
  theme_material: 'plastic',
  baseScale: 80,
  strength: 1,
};

// How long the dice stay on the table after the last throw, and the beat between the hit
// roll and its damage roll so the first result is readable before the dice are swept away.
const HOLD_MS = 1800;
const BETWEEN_THROWS_MS = 700;
// Rolls arriving faster than they play: keep the newest few, drop the oldest.
const MAX_PENDING = 3;

const wait = (ms, setTimer) => new Promise(resolve => setTimer(resolve, ms));

/**
 * @param {object} [deps] injectable for tests; production uses the defaults
 */
export function createDiceController({
  loadLibrary = defaultLoadLibrary,
  createSound = createDiceSound,
  supportsWebGL = defaultSupportsWebGL,
  isHidden = () => document.hidden,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  holdMs = HOLD_MS,
  betweenThrowsMs = BETWEEN_THROWS_MS,
} = {}) {
  let container = null;
  let boxPromise = null;
  let box = null;
  let broken = false; // no WebGL or the chunk failed to load: stay silent for this session
  let pending = [];
  let running = false;
  let generation = 0; // bumped by teardown; work started under an older one is abandoned
  let clearTimerId = null;
  let resizeObserver = null;
  let resizePending = false;
  let sound = null;

  const fitToContainer = () => {
    if (!box || !container) return;
    box.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    box.setDimensions({ x: container.clientWidth, y: container.clientHeight });
  };

  const ensureBox = () => {
    if (broken || !container) return Promise.resolve(null);
    if (boxPromise) return boxPromise;
    if (!supportsWebGL()) {
      broken = true;
      return Promise.resolve(null);
    }
    const gen = generation;
    const target = container;
    boxPromise = loadLibrary()
      .then(async ({ default: DiceBox }) => {
        const b = new DiceBox(`#${target.id}`, BOX_CONFIG);
        await b.initialize();
        if (gen !== generation) {
          disposeBox(b);
          return null;
        }
        box = b;
        sound = sound || createSound();
        sound.preload();
        // The library binds eventCollide per spawned die, so replacing the method before the
        // first roll routes every physics hit here. During the silent pre-simulation the
        // library fires the same events; animstate tells them apart.
        b.eventCollide = ({ body, target: hitDie }) => {
          if (b.animstate === 'simulate' || !body) return;
          const mover = body.mass > 0 ? body : hitDie;
          sound.hit(mover?.velocity?.length?.() ?? 0);
        };
        fitToContainer();
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => {
            // Resizing moves the physics walls; doing it mid-throw would change where dice land.
            if (running) resizePending = true;
            else fitToContainer();
          });
          resizeObserver.observe(target);
        }
        return b;
      })
      .catch(() => {
        broken = true;
        boxPromise = null;
        return null;
      });
    return boxPromise;
  };

  const applyColor = (b, color) => b.updateConfig({
    theme_customColorset: {
      name: `player-${color}`, // the library caches colour sets by name
      background: color,
      foreground: labelColorFor(color),
      outline: color,
      texture: 'none',
      material: 'plastic',
    },
  });

  const pump = async () => {
    if (running) return;
    running = true;
    const gen = generation;
    clearTimer(clearTimerId);
    while (pending.length > 0) {
      const job = pending.shift();
      const b = await ensureBox();
      if (gen !== generation) return;
      if (!b) {
        pending = [];
        break;
      }
      for (let i = 0; i < job.throws.length; i++) {
        if (i > 0) await wait(betweenThrowsMs, setTimer);
        if (gen !== generation) return;
        await applyColor(b, job.color);
        await b.roll(job.throws[i].notation);
        if (gen !== generation) return;
      }
    }
    running = false;
    if (resizePending) {
      resizePending = false;
      fitToContainer();
    }
    clearTimerId = setTimer(() => {
      if (!running && gen === generation && box) box.clearDice();
    }, holdMs);
  };

  const disposeBox = (b) => {
    try {
      b.renderer?.dispose?.();
      b.renderer?.domElement?.remove?.();
    } catch {
      /* best effort: the canvas is going away with the scene anyway */
    }
  };

  const teardown = () => {
    generation += 1;
    pending = [];
    running = false;
    resizePending = false;
    clearTimer(clearTimerId);
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (box) disposeBox(box);
    box = null;
    boxPromise = null;
  };

  // The user switched the dice off: sweep the table now, keep the overlay attached so
  // switching back on works without a remount. The box is rebuilt on the next roll.
  const stop = () => {
    teardown();
    sound?.dispose();
    sound = null;
  };

  return {
    // The overlay element must carry an id: the library looks its container up by selector.
    attach(el) {
      if (container === el) return;
      if (container) teardown();
      container = el;
    },

    detach(el) {
      if (container !== el) return;
      teardown();
      container = null;
    },

    /**
     * Queue a fresh roll for replay. Callers decide WHO sees it (visibility, setting);
     * this decides only whether it CAN be shown.
     * @param {{ dice: object[], color: string }} roll
     */
    play({ dice, color }) {
      if (broken || !container || isHidden()) return;
      const throws = planThrows(dice);
      if (throws.length === 0) return;
      pending.push({ throws, color });
      if (pending.length > MAX_PENDING) pending.shift();
      pump();
    },

    stop,

    dispose() {
      stop();
      container = null;
    },
  };
}
