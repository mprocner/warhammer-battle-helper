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

// Map selection items ({kind:'char', id: characterId} | {kind:'image', id}) to add-requests. A
// character id stands for every placement of that character on the scene.
export const combatEntriesForSelection = (selection, scene) => {
  const out = [];
  selection.forEach(s => {
    if (s.kind === 'image') {
      out.push({ kind: 'image', sourceId: s.id });
      return;
    }
    (scene?.characters || [])
      .filter(c => c.characterId === s.id)
      .forEach(c => out.push({ kind: 'character', sourceId: c.id }));
  });
  return out;
};

// Existing entries for the selected tokens.
export const combatEntriesInSelection = (combat, selection, scene) =>
  combatEntriesForSelection(selection, scene)
    .map(s => entryForSource(combat, s.kind, s.sourceId))
    .filter(Boolean);

const stripExtension = (name = '') => name.replace(/\.[^.]+$/, '');

// Scene tokens that can still join: character placements and tokens-layer images.
export const combatCandidates = (scene, combat) => [
  ...(scene?.characters || [])
    .filter(c => !isInCombat(combat, 'character', c.id))
    .map(c => ({ kind: 'character', sourceId: c.id, name: c.name, avatar: c.avatar })),
  ...(scene?.images || [])
    .filter(i => i.layer === 'tokens' && !isInCombat(combat, 'image', i.id))
    .map(i => ({ kind: 'image', sourceId: i.id, name: stripExtension(i.fileName), avatar: i.fileUrl })),
];
