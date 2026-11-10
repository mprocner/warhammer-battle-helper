import { createDiceSound } from './diceSound';

// jsdom's HTMLMediaElement cannot play; a fake voice tracks paused/volume and lets the test
// decide whether play() resolves or is blocked by the autoplay policy.
function fakeAudioFactory({ blocked = false } = {}) {
  const created = [];
  const createAudio = (url) => {
    const voice = {
      url,
      paused: true,
      volume: 1,
      currentTime: 5,
      play: jest.fn(() => {
        if (blocked) return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
        voice.paused = false;
        return Promise.resolve();
      }),
      pause: jest.fn(() => { voice.paused = true; }),
      removeAttribute: jest.fn(),
    };
    created.push(voice);
    return voice;
  };
  return { created, createAudio };
}

describe('createDiceSound', () => {
  let clock;
  const now = () => clock;
  beforeEach(() => { clock = 1000; });

  it('plays a hit with volume scaled by speed', () => {
    const { created, createAudio } = fakeAudioFactory();
    const sound = createDiceSound({ urls: ['a', 'b'], createAudio, now });
    sound.hit(4000);
    const playing = created.filter(v => !v.paused);
    expect(playing).toHaveLength(1);
    expect(playing[0].volume).toBeCloseTo(0.3);
    expect(playing[0].currentTime).toBe(0);
  });

  it('ignores slow touches', () => {
    const { created, createAudio } = fakeAudioFactory();
    const sound = createDiceSound({ urls: ['a'], createAudio, now });
    sound.hit(100);
    expect(created.every(v => v.play.mock.calls.length === 0)).toBe(true);
  });

  it('collapses hits closer than the minimum gap', () => {
    const { created, createAudio } = fakeAudioFactory();
    const sound = createDiceSound({ urls: ['a', 'b', 'c'], createAudio, now, minGapMs: 40 });
    sound.hit(5000);
    clock += 10;
    sound.hit(5000);
    expect(created.filter(v => !v.paused)).toHaveLength(1);
  });

  it('never plays more voices at once than the limit', () => {
    const { created, createAudio } = fakeAudioFactory();
    const sound = createDiceSound({ urls: ['a', 'b', 'c', 'd', 'e'], createAudio, now, maxVoices: 2 });
    for (let i = 0; i < 5; i++) {
      sound.hit(5000);
      clock += 100;
    }
    expect(created.filter(v => !v.paused)).toHaveLength(2);
  });

  it('swallows an autoplay rejection', async () => {
    const { createAudio } = fakeAudioFactory({ blocked: true });
    const sound = createDiceSound({ urls: ['a'], createAudio, now });
    expect(() => sound.hit(5000)).not.toThrow();
    await Promise.resolve(); // an unhandled rejection would fail the test run
  });

  it('creates no audio until it is needed', () => {
    const { created, createAudio } = fakeAudioFactory();
    createDiceSound({ urls: ['a'], createAudio, now });
    expect(created).toHaveLength(0);
  });

  it('stops every voice on dispose', () => {
    const { created, createAudio } = fakeAudioFactory();
    const sound = createDiceSound({ urls: ['a', 'b'], createAudio, now });
    sound.hit(5000);
    sound.dispose();
    expect(created.every(v => v.paused)).toBe(true);
  });
});
