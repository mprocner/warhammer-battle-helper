import { createDiceController } from './diceController';

// jsdom has no WebGL, so the real library never runs here. FakeDiceBox mimics the slice of
// its API the controller uses, and every roll() hands the test a resolver: a roll is "still
// animating" until the test says otherwise.
function makeLibrary() {
  const boxes = [];
  class FakeDiceBox {
    constructor(selector, config) {
      this.selector = selector;
      this.config = config;
      this.rolls = [];
      this.colors = [];
      this.cleared = 0;
      this.animstate = '';
      this.renderer = { setPixelRatio: jest.fn(), dispose: jest.fn(), domElement: { remove: jest.fn() } };
      this.setDimensions = jest.fn();
      boxes.push(this);
    }
    initialize() { return Promise.resolve(); }
    updateConfig(cfg) { this.colors.push(cfg.theme_customColorset); return Promise.resolve(); }
    roll(notation) {
      return new Promise(resolve => { this.rolls.push({ notation, resolve }); });
    }
    clearDice() { this.cleared += 1; }
  }
  const loadLibrary = jest.fn(() => Promise.resolve({ default: FakeDiceBox }));
  return { boxes, loadLibrary };
}

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

const fakeSound = () => ({ preload: jest.fn(), hit: jest.fn(), dispose: jest.fn() });

function setup(overrides = {}) {
  const lib = makeLibrary();
  const sound = fakeSound();
  const timers = [];
  const controller = createDiceController({
    loadLibrary: lib.loadLibrary,
    createSound: () => sound,
    supportsWebGL: () => true,
    isHidden: () => false,
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: () => {},
    ...overrides,
  });
  const el = document.createElement('div');
  el.id = 'dice-overlay-test';
  return { controller, lib, sound, timers, el };
}

const D20 = [{ sides: 20, value: 17 }];

describe('createDiceController', () => {
  it('does not load the 3D library until a roll needs it', async () => {
    const { controller, lib, el } = setup();
    controller.attach(el);
    await flush();
    expect(lib.loadLibrary).not.toHaveBeenCalled();

    controller.play({ dice: D20, color: '#4363d8' });
    await flush();
    expect(lib.loadLibrary).toHaveBeenCalledTimes(1);
    expect(lib.boxes[0].selector).toBe('#dice-overlay-test');
    expect(lib.boxes[0].rolls[0].notation).toBe('1d20@17');
  });

  it('does not load anything for a roll it cannot show', async () => {
    const { controller, lib, el } = setup();
    controller.attach(el);
    controller.play({ dice: [{ sides: 7, value: 3 }], color: '#4363d8' });
    controller.play({ dice: [], color: '#4363d8' });
    await flush();
    expect(lib.loadLibrary).not.toHaveBeenCalled();
  });

  it('skips rolls while the tab is hidden', async () => {
    const { controller, lib, el } = setup({ isHidden: () => true });
    controller.attach(el);
    controller.play({ dice: D20, color: '#4363d8' });
    await flush();
    expect(lib.loadLibrary).not.toHaveBeenCalled();
  });

  it('ignores rolls with no overlay mounted', async () => {
    const { controller, lib } = setup();
    controller.play({ dice: D20, color: '#4363d8' });
    await flush();
    expect(lib.loadLibrary).not.toHaveBeenCalled();
  });

  it('plays rolls one at a time, never starting a roll over a moving one', async () => {
    const { controller, lib, el } = setup();
    controller.attach(el);
    controller.play({ dice: D20, color: '#e6194b' });
    controller.play({ dice: [{ sides: 6, value: 2 }], color: '#ffe119' });
    await flush();
    const box = lib.boxes[0];
    expect(box.rolls.map(r => r.notation)).toEqual(['1d20@17']);

    box.rolls[0].resolve();
    await flush();
    expect(box.rolls.map(r => r.notation)).toEqual(['1d20@17', '1d6@2']);
    expect(box.colors.map(c => [c.background, c.foreground])).toEqual([
      ['#e6194b', '#ffffff'],
      ['#ffe119', '#1a1a1a'],
    ]);
  });

  it('keeps only the newest rolls when they pile up', async () => {
    const { controller, lib, el } = setup();
    controller.attach(el);
    for (let v = 1; v <= 6; v++) controller.play({ dice: [{ sides: 20, value: v }], color: '#4363d8' });
    await flush();
    const box = lib.boxes[0];
    for (let i = 0; i < 4; i++) {
      box.rolls[i].resolve();
      await flush();
    }
    // First roll started at once; of the five queued behind it, only the newest three remain.
    expect(box.rolls.map(r => r.notation)).toEqual(['1d20@1', '1d20@4', '1d20@5', '1d20@6']);
  });

  it('throws the damage dice after the hit roll, with a pause between', async () => {
    const { controller, lib, timers, el } = setup();
    controller.attach(el);
    controller.play({
      dice: [{ sides: 100, value: 30 }, { sides: 10, value: 4 }, { sides: 6, value: 5, group: 'damage' }],
      color: '#4363d8',
    });
    await flush();
    const box = lib.boxes[0];
    box.rolls[0].resolve();
    await flush();
    expect(box.rolls).toHaveLength(1); // waiting for the beat between throws
    timers.at(-1).fn();
    await flush();
    expect(box.rolls.map(r => r.notation)).toEqual(['1d100+1d10@30,4', '1d6@5']);
  });

  it('clears the table only after the hold time', async () => {
    const { controller, lib, timers, el } = setup();
    controller.attach(el);
    controller.play({ dice: D20, color: '#4363d8' });
    await flush();
    lib.boxes[0].rolls[0].resolve();
    await flush();
    expect(lib.boxes[0].cleared).toBe(0);
    timers.at(-1).fn();
    expect(lib.boxes[0].cleared).toBe(1);
  });

  it('stays silent for the session when WebGL is missing', async () => {
    const { controller, lib, el } = setup({ supportsWebGL: () => false });
    controller.attach(el);
    controller.play({ dice: D20, color: '#4363d8' });
    controller.play({ dice: D20, color: '#4363d8' });
    await flush();
    expect(lib.loadLibrary).not.toHaveBeenCalled();
  });

  it('stays silent after the chunk fails to load', async () => {
    const { controller, lib, el } = setup();
    lib.loadLibrary.mockImplementation(() => Promise.reject(new Error('ChunkLoadError')));
    controller.attach(el);
    controller.play({ dice: D20, color: '#4363d8' });
    await flush();
    controller.play({ dice: D20, color: '#4363d8' });
    await flush();
    expect(lib.loadLibrary).toHaveBeenCalledTimes(1);
  });

  it('removes the canvas on detach and starts fresh on the next overlay', async () => {
    const { controller, lib, el } = setup();
    controller.attach(el);
    controller.play({ dice: D20, color: '#4363d8' });
    await flush();
    controller.detach(el); // mid-roll: that roll's promise never settles, the queue must not wait on it
    expect(lib.boxes[0].renderer.dispose).toHaveBeenCalled();
    expect(lib.boxes[0].renderer.domElement.remove).toHaveBeenCalled();

    const el2 = document.createElement('div');
    el2.id = 'dice-overlay-2';
    controller.attach(el2);
    controller.play({ dice: [{ sides: 6, value: 6 }], color: '#4363d8' });
    await flush();
    expect(lib.boxes).toHaveLength(2);
    expect(lib.boxes[1].rolls.map(r => r.notation)).toEqual(['1d6@6']);
  });

  it('routes animated physics hits to the sound, but not the silent pre-simulation', async () => {
    const { controller, lib, sound, el } = setup();
    controller.attach(el);
    controller.play({ dice: D20, color: '#4363d8' });
    await flush();
    const box = lib.boxes[0];
    const fast = { mass: 300, velocity: { length: () => 4000 } };

    box.animstate = 'simulate';
    box.eventCollide({ body: fast, target: fast });
    expect(sound.hit).not.toHaveBeenCalled();

    box.animstate = 'throw';
    box.eventCollide({ body: fast, target: fast });
    expect(sound.hit).toHaveBeenCalledWith(4000);
  });

  it('fits the canvas to the screen density', async () => {
    const { controller, lib, el } = setup();
    controller.attach(el);
    controller.play({ dice: D20, color: '#4363d8' });
    await flush();
    expect(lib.boxes[0].renderer.setPixelRatio).toHaveBeenCalled();
    expect(lib.boxes[0].setDimensions).toHaveBeenCalled();
  });

  it('stop sweeps the table and silences, then works again on the next roll', async () => {
    const { controller, lib, sound, el } = setup();
    controller.attach(el);
    controller.play({ dice: D20, color: '#4363d8' });
    await flush();
    controller.stop();
    expect(lib.boxes[0].renderer.domElement.remove).toHaveBeenCalled();
    expect(sound.dispose).toHaveBeenCalled();

    controller.play({ dice: D20, color: '#4363d8' });
    await flush();
    expect(lib.boxes).toHaveLength(2);
  });
});
