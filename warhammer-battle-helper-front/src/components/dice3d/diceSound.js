// Collision sounds for the 3D dice. The library's own sound loader wants 28 fixed file names
// and ships clips of unknown origin, so it stays off (sounds: false) and the controller feeds
// physics hits in here instead. Clips: Kenney "Casino Audio", CC0 (see /licenses).

export const DICE_HIT_URLS = Array.from({ length: 7 }, (_, i) => `/sounds/dice/dice-hit-${i + 1}.m4a`);

// Hits slower than this make no sound (same floor the library uses).
const MIN_SPEED = 250;
// Speed that plays at full volume; the library scales volume by speed / 8000 too.
const FULL_VOLUME_SPEED = 8000;
const MAX_VOLUME = 0.6;

/**
 * @param {object} [opts]
 * @param {string[]} [opts.urls]
 * @param {number} [opts.maxVoices] simultaneous clips; a burst of hits never stacks louder
 * @param {number} [opts.minGapMs] hits closer than this collapse into one
 * @param {() => number} [opts.now]
 * @param {(url: string) => HTMLAudioElement} [opts.createAudio]
 */
export function createDiceSound({
  urls = DICE_HIT_URLS,
  maxVoices = 3,
  minGapMs = 40,
  now = () => Date.now(),
  createAudio = (url) => new Audio(url),
} = {}) {
  let voices = null;
  let lastHit = -Infinity;

  const ensureVoices = () => {
    if (!voices) {
      voices = urls.map(url => {
        const a = createAudio(url);
        a.preload = 'auto';
        return a;
      });
    }
    return voices;
  };

  return {
    // Called once the dice box exists, so the clips are buffered before the first hit.
    preload: ensureVoices,

    hit(speed) {
      if (!(speed >= MIN_SPEED)) return;
      const t = now();
      if (t - lastHit < minGapMs) return;
      const pool = ensureVoices();
      if (pool.filter(v => !v.paused).length >= maxVoices) return;
      const idle = pool.filter(v => v.paused);
      if (idle.length === 0) return;
      lastHit = t;
      const voice = idle[Math.floor(Math.random() * idle.length)];
      voice.currentTime = 0;
      voice.volume = Math.min(speed / FULL_VOLUME_SPEED, 1) * MAX_VOLUME;
      // Browsers reject play() until the user has interacted with the page; the first roll
      // someone else makes after joining is then silent, which is fine — never an error.
      const played = voice.play();
      if (played && typeof played.catch === 'function') played.catch(() => {});
    },

    dispose() {
      (voices || []).forEach(v => {
        v.pause();
        v.removeAttribute('src');
      });
      voices = null;
    },
  };
}
