import {
  activeEntry, allActed, toolbarState, isInCombat, entryForSource, activeSource,
  combatEntriesForSelection, combatEntriesInSelection, combatCandidates,
} from './combatSelectors';

const combat = {
  round: 2, activeId: 'e2', visibleToPlayers: true,
  entries: [
    { id: 'e1', kind: 'character', sourceId: 'p1', name: 'Hero', acted: true },
    { id: 'e2', kind: 'image', sourceId: 'i1', name: 'Wolf', acted: false, canEndTurn: true },
    { id: 'e3', kind: 'manual', name: 'Trap', acted: false },
  ],
};
const scene = {
  characters: [{ id: 'p1', characterId: 'c1', name: 'Hero' }, { id: 'p2', characterId: 'c2', name: 'Mage', avatar: '/m.png' }],
  images: [{ id: 'i1', layer: 'tokens', fileName: 'wolf.png' }, { id: 'i2', layer: 'tokens', fileName: 'dire-bear.webp', fileUrl: '/b.webp' }, { id: 'i3', layer: 'background', fileName: 'map.jpg' }],
};

test('activeEntry and activeSource', () => {
  expect(activeEntry(combat).name).toBe('Wolf');
  expect(activeSource(combat)).toEqual({ kind: 'image', sourceId: 'i1' });
  expect(activeEntry(null)).toBeNull();
  expect(activeSource({ ...combat, activeId: 'e3' })).toBeNull();
});

test('allActed counts the dead as done', () => {
  expect(allActed(combat)).toBe(false);
  expect(allActed({ entries: [{ acted: true }, { acted: false, killed: true }] })).toBe(true);
  expect(allActed({ entries: [] })).toBe(false);
});

test('toolbarState', () => {
  expect(toolbarState({ combat: null, isGM: true })).toBe('idle');
  expect(toolbarState({ combat: null, isGM: false })).toBe('none');
  expect(toolbarState({ combat: { ...combat, visibleToPlayers: false }, isGM: true })).toBe('hidden');
  expect(toolbarState({ combat, isGM: true })).toBe('live');
  expect(toolbarState({ combat, isGM: false })).toBe('myTurn');
  expect(toolbarState({ combat: { ...combat, activeId: 'e1' }, isGM: false })).toBe('live');
});

test('isInCombat / entryForSource', () => {
  expect(isInCombat(combat, 'character', 'p1')).toBe(true);
  expect(isInCombat(combat, 'character', 'p2')).toBe(false);
  expect(entryForSource(combat, 'image', 'i1').id).toBe('e2');
  expect(isInCombat(null, 'image', 'i1')).toBe(false);
});

test('selection maps character ids to every placement of that character', () => {
  const sel = [{ kind: 'char', id: 'c2' }, { kind: 'image', id: 'i2' }];
  expect(combatEntriesForSelection(sel, scene)).toEqual([
    { kind: 'character', sourceId: 'p2' }, { kind: 'image', sourceId: 'i2' },
  ]);
  expect(combatEntriesInSelection(combat, [{ kind: 'char', id: 'c1' }, { kind: 'image', id: 'i2' }], scene).map(e => e.id)).toEqual(['e1']);
});

test('combatCandidates lists scene tokens not yet in combat', () => {
  expect(combatCandidates(scene, combat)).toEqual([
    { kind: 'character', sourceId: 'p2', name: 'Mage', avatar: '/m.png' },
    { kind: 'image', sourceId: 'i2', name: 'dire-bear', avatar: '/b.webp' },
  ]);
});
