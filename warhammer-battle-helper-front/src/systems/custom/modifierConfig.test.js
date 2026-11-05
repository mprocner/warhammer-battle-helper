import {
  readModifierConfig,
  clampModifier,
  formatModifier,
  edgeDiceButtons,
  clampEdgeDiceMax,
  MOD_TARGET_ROLL,
  MOD_TARGET_THRESHOLD,
  MOD_TARGET_DICE_COUNT,
  MOD_KIND_NUMBER,
  MOD_KIND_DICE,
  DICE_MODE_FORMULA,
} from './modifierConfig';

describe('readModifierConfig', () => {
  it('returns null when the template has no settings at all', () => {
    expect(readModifierConfig(undefined)).toBeNull();
    expect(readModifierConfig({})).toBeNull();
    expect(readModifierConfig({ settings: {} })).toBeNull();
  });

  it('returns null when the modifier is disabled', () => {
    expect(readModifierConfig({ settings: { modifier: { enabled: false } } })).toBeNull();
  });

  it('fills in defaults for an enabled config', () => {
    const cfg = readModifierConfig({ settings: { modifier: { enabled: true } } });
    expect(cfg).toMatchObject({
      enabled: true,
      traditionalTarget: MOD_TARGET_ROLL,
      poolTarget: MOD_TARGET_DICE_COUNT,
      step: 1,
      presets: [],
    });
  });

  it('keeps GM-configured values', () => {
    const cfg = readModifierConfig({
      settings: { modifier: { enabled: true, traditionalTarget: MOD_TARGET_THRESHOLD, step: 10, min: -60, max: 60, presets: [{ value: -20, label: 'Trudny' }] } },
    });
    expect(cfg.traditionalTarget).toBe(MOD_TARGET_THRESHOLD);
    expect(cfg.step).toBe(10);
    expect(cfg.min).toBe(-60);
    expect(cfg.max).toBe(60);
    expect(cfg.presets).toHaveLength(1);
  });

  it('repairs a step of zero — an input with step 0 refuses to increment', () => {
    expect(readModifierConfig({ settings: { modifier: { enabled: true, step: 0 } } }).step).toBe(1);
  });
});

describe('clampModifier', () => {
  const cfg = { min: -60, max: 60 };

  it('passes values inside the range', () => {
    expect(clampModifier(20, cfg)).toBe(20);
  });

  it('clamps both ends', () => {
    expect(clampModifier(999, cfg)).toBe(60);
    expect(clampModifier(-999, cfg)).toBe(-60);
  });

  it('treats a zero range as no limit', () => {
    expect(clampModifier(999, { min: 0, max: 0 })).toBe(999);
  });

  it('parses the string an input element gives back', () => {
    expect(clampModifier('-20', cfg)).toBe(-20);
  });

  it('reads unparseable input as zero, never as NaN', () => {
    expect(clampModifier('', cfg)).toBe(0);
    expect(clampModifier('-', cfg)).toBe(0);
  });
});

describe('formatModifier', () => {
  it('signs positives and leaves the rest alone', () => {
    expect(formatModifier(20)).toBe('+20');
    expect(formatModifier(-20)).toBe('-20');
    expect(formatModifier(0)).toBe('0');
  });
});

describe('edge dice config', () => {
  it('reads an unset kind as number', () => {
    const cfg = readModifierConfig({ settings: { modifier: { enabled: true } } });
    expect(cfg.kind).toBe(MOD_KIND_NUMBER);
    expect(cfg.diceMode).toBe(DICE_MODE_FORMULA);
  });

  it('keeps the dice kind and its maxima', () => {
    const cfg = readModifierConfig({ settings: { modifier: { enabled: true, kind: 'dice', maxEdge: 2, maxSetback: 1 } } });
    expect(cfg.kind).toBe(MOD_KIND_DICE);
    expect(cfg.maxEdge).toBe(2);
    expect(cfg.maxSetback).toBe(1);
  });

  it.each([
    [{ maxEdge: 2, maxSetback: 2 }, [2, 1, 0, -1, -2]],
    [{ maxEdge: 0, maxSetback: 2 }, [0, -1, -2]],
    [{ maxEdge: 3, maxSetback: 0 }, [3, 2, 1, 0]],
    [{ maxEdge: 9, maxSetback: -4 }, [5, 4, 3, 2, 1, 0]],
  ])('lists the column for %j', (cfg, expected) => {
    expect(edgeDiceButtons(cfg).map(b => b.diceMod)).toEqual(expected);
  });

  it('types the buttons by sign', () => {
    expect(edgeDiceButtons({ maxEdge: 1, maxSetback: 1 }).map(b => b.type)).toEqual(['edge', 'neutral', 'setback']);
  });

  it.each([['3', 3], ['', 0], ['-2', 0], ['12', 5], [4, 4]])('clamps max %p to %p', (input, expected) => {
    expect(clampEdgeDiceMax(input)).toBe(expected);
  });
});
