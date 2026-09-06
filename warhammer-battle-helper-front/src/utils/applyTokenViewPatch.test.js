import { applyTokenViewPatch } from './applyTokenViewPatch';

const state = () => ({
  id: 'g1',
  scenes: [
    {
      id: 's1',
      characters: [
        { id: 'p1', characterId: 'c1', name: 'Goblin', avatar: '/a.png', killed: false, positionX: 3, tokenView: { slots: [] } },
        { id: 'p2', characterId: 'c2', name: 'Orc', avatar: '/b.png', killed: false, positionX: 7 },
      ],
    },
    {
      id: 's2',
      characters: [
        { id: 'p3', characterId: 'c1', name: 'Goblin', avatar: '/a.png', killed: false, positionX: 1 },
      ],
    },
  ],
});

const view = (over = {}) => ({
  sceneId: 's1',
  placementId: 'p1',
  name: 'Goblin',
  avatar: '/a.png',
  killed: false,
  tokenView: { slots: [{ slot: { id: 'p0', type: 'field' }, value: 5 }] },
  ...over,
});

describe('applyTokenViewPatch', () => {
  it('replaces the tokenView of the addressed placement', () => {
    const next = applyTokenViewPatch(state(), [view()]);
    expect(next.scenes[0].characters[0].tokenView.slots[0].value).toBe(5);
  });

  it('leaves every other placement untouched', () => {
    const next = applyTokenViewPatch(state(), [view()]);
    expect(next.scenes[0].characters[1]).toEqual(state().scenes[0].characters[1]);
    expect(next.scenes[1].characters[0]).toEqual(state().scenes[1].characters[0]);
  });

  it('keeps placement fields the event does not carry', () => {
    const next = applyTokenViewPatch(state(), [view()]);
    expect(next.scenes[0].characters[0].positionX).toBe(3);
    expect(next.scenes[0].characters[0].characterId).toBe('c1');
  });

  it('patches placements across several scenes in one event', () => {
    const next = applyTokenViewPatch(state(), [
      view({ killed: true }),
      view({ sceneId: 's2', placementId: 'p3', killed: true }),
    ]);
    expect(next.scenes[0].characters[0].killed).toBe(true);
    expect(next.scenes[1].characters[0].killed).toBe(true);
  });

  it('carries name, avatar and killed', () => {
    const next = applyTokenViewPatch(state(), [view({ name: 'Goblin Boss', avatar: '/boss.png', killed: true })]);
    const patched = next.scenes[0].characters[0];
    expect(patched.name).toBe('Goblin Boss');
    expect(patched.avatar).toBe('/boss.png');
    expect(patched.killed).toBe(true);
  });

  it('ignores an unknown placementId', () => {
    const before = state();
    const next = applyTokenViewPatch(before, [view({ placementId: 'nope' })]);
    expect(next.scenes).toEqual(before.scenes);
  });

  it('returns the same state for an empty or missing views list', () => {
    const before = state();
    expect(applyTokenViewPatch(before, [])).toBe(before);
    expect(applyTokenViewPatch(before)).toBe(before);
  });

  it('tolerates a null state', () => {
    expect(applyTokenViewPatch(null, [view()])).toBeNull();
  });
});
