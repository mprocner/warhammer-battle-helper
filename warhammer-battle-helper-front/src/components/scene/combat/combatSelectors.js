// Pure reads over the masked combat view returned by GET .../combat.

export const activeEntry = (combat) =>
  (combat && combat.entries.find(e => e.id === combat.activeId)) || null;

// The scene token to highlight on the map; manual entries have none.
export const activeSource = (combat) => {
  const a = activeEntry(combat);
  return a && a.kind !== 'manual' ? { kind: a.kind, sourceId: a.sourceId } : null;
};

// Everyone has acted (the dead count as done) — the moment to close the round.
export const allActed = (combat) =>
  !!combat && combat.entries.length > 0 && combat.entries.every(e => e.acted || e.killed);

// The tracker button's look. 'none' = render nothing (a player with no visible combat).
export const toolbarState = ({ combat, isGM }) => {
  if (!combat) return isGM ? 'idle' : 'none';
  if (isGM && !combat.visibleToPlayers) return 'hidden';
  if (!isGM && activeEntry(combat)?.canEndTurn) return 'myTurn';
  return 'live';
};

export const entryForSource = (combat, kind, sourceId) =>
  (combat && combat.entries.find(e => e.kind === kind && e.sourceId === sourceId)) || null;

export const isInCombat = (combat, kind, sourceId) => !!entryForSource(combat, kind, sourceId);

// A token of this character is the active one. A character has one entry for all its tokens, so
// every token of the active character glows.
export const isCharacterTokenActive = (combat, characterId) => {
  const a = activeSource(combat);
  return !!a && a.kind === 'gameCharacter' && a.sourceId === characterId;
};

// Map selection items ({kind:'char', id: characterId} | {kind:'image', id}) to add-requests. A
// character id is one entry however many tokens it has on the scene.
export const combatEntriesForSelection = (selection, scene) => {
  const out = [];
  selection.forEach(s => {
    if (s.kind !== 'image') {
      out.push({ kind: 'gameCharacter', sourceId: s.id });
      return;
    }
    // Only tokens-layer images can join combat (backend enforces the same rule).
    if ((scene?.images || []).some(i => i.id === s.id && i.layer === 'tokens')) {
      out.push({ kind: 'image', sourceId: s.id });
    }
  });
  return out;
};

// Existing entries for the selected tokens.
export const combatEntriesInSelection = (combat, selection, scene) =>
  combatEntriesForSelection(selection, scene)
    .map(s => entryForSource(combat, s.kind, s.sourceId))
    .filter(Boolean);

const stripExtension = (name = '') => name.replace(/\.[^.]+$/, '');

const characterOption = (c) => ({
  kind: 'gameCharacter',
  sourceId: c.id,
  name: c.basicInfo?.name || c.name || '',
  avatar: c.avatar || c.basicInfo?.avatar,
});

// The add panel's groups — players' characters, NPCs, tokens-layer images of this scene — each
// holding what is not in combat yet, sorted by name in the UI language. Empty groups are left out.
export const addGroups = (characters, scene, combat, locale) => {
  const byName = (a, b) => a.name.localeCompare(b.name, locale, { sensitivity: 'base' });
  const free = (characters || []).filter(c => !isInCombat(combat, 'gameCharacter', c.id));
  const groups = [
    { id: 'characters', items: free.filter(c => !c.isNPC).map(characterOption) },
    { id: 'npcs', items: free.filter(c => c.isNPC).map(characterOption) },
    {
      id: 'tokens',
      items: (scene?.images || [])
        .filter(i => i.layer === 'tokens' && !isInCombat(combat, 'image', i.id))
        // Named by the token's label, as on the map; the file name is the fallback (the server
        // names the entry the same way — CombatService.buildEntry).
        .map(i => ({ kind: 'image', sourceId: i.id, name: i.label || stripExtension(i.fileName), avatar: i.fileUrl })),
    },
  ];
  return groups
    .map(g => ({ ...g, items: [...g.items].sort(byName) }))
    .filter(g => g.items.length > 0);
};
