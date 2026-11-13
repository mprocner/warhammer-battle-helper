import {
  activeEntry, allActed, toolbarState, isInCombat, entryForSource, activeSource,
  combatEntriesForSelection, combatEntriesInSelection, addGroups,
  isCharacterTokenActive,
} from './combatSelectors';

const combat = {
  round: 2, activeId: 'e2', visibleToPlayers: true,
  entries: [
    { id: 'e1', kind: 'gameCharacter', sourceId: 'c1', name: 'Hero', acted: true },
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
  expect(isInCombat(combat, 'gameCharacter', 'c1')).toBe(true);
  expect(isInCombat(combat, 'gameCharacter', 'c2')).toBe(false);
  expect(entryForSource(combat, 'image', 'i1').id).toBe('e2');
  expect(isInCombat(null, 'image', 'i1')).toBe(false);
});

test('selection maps a character to one entry, however many tokens it has', () => {
  const twice = { ...scene, characters: [...scene.characters, { id: 'p4', characterId: 'c2', name: 'Mage' }] };
  const sel = [{ kind: 'char', id: 'c2' }, { kind: 'image', id: 'i2' }];
  expect(combatEntriesForSelection(sel, twice)).toEqual([
    { kind: 'gameCharacter', sourceId: 'c2' }, { kind: 'image', sourceId: 'i2' },
  ]);
  expect(combatEntriesInSelection(combat, [{ kind: 'char', id: 'c1' }, { kind: 'image', id: 'i2' }], scene).map(e => e.id)).toEqual(['e1']);
});

test('combatEntriesForSelection ignores images outside the tokens layer', () => {
  const sel = [{ kind: 'image', id: 'i3' }, { kind: 'image', id: 'missing' }, { kind: 'image', id: 'i2' }];
  expect(combatEntriesForSelection(sel, scene)).toEqual([{ kind: 'image', sourceId: 'i2' }]);
});

test('addGroups: players, NPCs and tokens not in combat, each sorted by name, on the scene or not', () => {
  const characters = [
    { id: 'c4', isNPC: true, basicInfo: { name: 'Ogre', avatar: '/o.png' } },
    { id: 'c1', name: 'Hero' }, // already in combat
    { id: 'c2', name: 'mage' }, // has a token on the scene: offered all the same (PLAYRPG-352)
    { id: 'c6', isNPC: true, name: 'Łucznik' },
    { id: 'c5', name: 'Aldric', avatar: '/r.png' },
    { id: 'c7', isNPC: true, name: 'Lis' },
  ];
  const groups = addGroups(characters, scene, combat, 'pl');
  expect(groups.map(g => g.id)).toEqual(['characters', 'npcs', 'tokens']);
  expect(groups[0].items).toEqual([
    { kind: 'gameCharacter', sourceId: 'c5', name: 'Aldric', avatar: '/r.png' },
    { kind: 'gameCharacter', sourceId: 'c2', name: 'mage', avatar: undefined },
  ]);
  // Locale-aware: Ł sorts right after L, not after Z.
  expect(groups[1].items.map(c => c.name)).toEqual(['Lis', 'Łucznik', 'Ogre']);
  expect(groups[2].items).toEqual([{ kind: 'image', sourceId: 'i2', name: 'dire-bear', avatar: '/b.webp' }]);
});

test('addGroups leaves empty groups out', () => {
  expect(addGroups([{ id: 'c5', name: 'Aldric' }], { images: [] }, null, 'en').map(g => g.id)).toEqual(['characters']);
  expect(addGroups(undefined, null, null, 'en')).toEqual([]);
});

test('isCharacterTokenActive: every token of the active character', () => {
  expect(isCharacterTokenActive({ ...combat, activeId: 'e1' }, 'c1')).toBe(true);
  expect(isCharacterTokenActive({ ...combat, activeId: 'e1' }, 'c2')).toBe(false);
  expect(isCharacterTokenActive(combat, 'c1')).toBe(false); // an image is active
  expect(isCharacterTokenActive(null, 'c1')).toBe(false);
});

test('addGroups: an image token is offered under its label, the file name only without one', () => {
  const labelled = { images: [
    { id: 'i1', layer: 'tokens', fileName: 'wolf.png', label: 'Alpha wolf' },
    { id: 'i2', layer: 'tokens', fileName: 'bear.png', label: '' },
  ] };
  const tokens = addGroups([], labelled, null, 'en').find(g => g.id === 'tokens');
  expect(tokens.items.map(i => i.name)).toEqual(['Alpha wolf', 'bear']);
});
