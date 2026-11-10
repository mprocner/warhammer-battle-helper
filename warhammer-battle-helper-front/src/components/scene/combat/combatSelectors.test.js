import {
  activeEntry, allActed, toolbarState, isInCombat, entryForSource, activeSource,
  combatEntriesForSelection, combatEntriesInSelection, combatCandidates,
  characterCandidates, isCharacterTokenActive,
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

test('combatEntriesForSelection ignores images outside the tokens layer', () => {
  const sel = [{ kind: 'image', id: 'i3' }, { kind: 'image', id: 'missing' }, { kind: 'image', id: 'i2' }];
  expect(combatEntriesForSelection(sel, scene)).toEqual([{ kind: 'image', sourceId: 'i2' }]);
});

test('combatCandidates lists scene tokens not yet in combat', () => {
  expect(combatCandidates(scene, combat)).toEqual([
    { kind: 'character', sourceId: 'p2', name: 'Mage', avatar: '/m.png' },
    { kind: 'image', sourceId: 'i2', name: 'dire-bear', avatar: '/b.webp' },
  ]);
});

// Hero (c1) is in combat by its placement p1; Bandit (c3) joined from the character list.
const withListed = { ...combat, entries: [...combat.entries, { id: 'e4', kind: 'gameCharacter', sourceId: 'c3', name: 'Bandit' }] };

test('characterCandidates offers off-scene list characters in no form of combat, players first', () => {
  const characters = [
    { id: 'c4', isNPC: true, basicInfo: { name: 'Ogre', avatar: '/o.png' } },
    { id: 'c1', name: 'Hero' }, // in combat by its token
    { id: 'c3', isNPC: true, name: 'Bandit' }, // joined from the list
    { id: 'c2', name: 'Mage' }, // on the scene: offered as a scene token instead
    { id: 'c5', name: 'Rogue', avatar: '/r.png' },
  ];
  expect(characterCandidates(characters, scene, withListed)).toEqual([
    { kind: 'gameCharacter', sourceId: 'c5', name: 'Rogue', avatar: '/r.png' },
    { kind: 'gameCharacter', sourceId: 'c4', name: 'Ogre', avatar: '/o.png' },
  ]);
  expect(characterCandidates(undefined, scene, null)).toEqual([]);
});

test('a character joined from the list covers its tokens on the map', () => {
  const sceneWithBandit = { ...scene, characters: [...scene.characters, { id: 'p3', characterId: 'c3', name: 'Bandit' }] };
  expect(combatCandidates(sceneWithBandit, withListed).map(c => c.sourceId)).not.toContain('p3');
  expect(combatEntriesForSelection([{ kind: 'char', id: 'c3' }], sceneWithBandit, withListed)).toEqual([{ kind: 'gameCharacter', sourceId: 'c3' }]);
  expect(combatEntriesInSelection(withListed, [{ kind: 'char', id: 'c3' }], sceneWithBandit).map(e => e.id)).toEqual(['e4']);
});

test('isCharacterTokenActive: own placement entry, or every token of a list entry', () => {
  expect(isCharacterTokenActive({ ...withListed, activeId: 'e1' }, 'p1', 'c1')).toBe(true);
  expect(isCharacterTokenActive({ ...withListed, activeId: 'e1' }, 'p9', 'c1')).toBe(false);
  expect(isCharacterTokenActive({ ...withListed, activeId: 'e4' }, 'p3', 'c3')).toBe(true);
  expect(isCharacterTokenActive({ ...withListed, activeId: 'e4' }, 'p3', 'c1')).toBe(false);
  expect(isCharacterTokenActive(null, 'p1', 'c1')).toBe(false);
});
