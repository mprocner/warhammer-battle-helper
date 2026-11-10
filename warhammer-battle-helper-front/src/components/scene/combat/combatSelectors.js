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

// A token of this character is the active one: its own placement entry, or the character joined
// from the character list (then every placement of it on the scene glows).
export const isCharacterTokenActive = (combat, placementId, characterId) => {
  const a = activeSource(combat);
  if (!a) return false;
  if (a.kind === 'character') return a.sourceId === placementId;
  return a.kind === 'gameCharacter' && a.sourceId === characterId;
};

// Map selection items ({kind:'char', id: characterId} | {kind:'image', id}) to add-requests. A
// character id stands for every placement of that character on the scene — unless the character
// already joined from the character list: then that one entry stands for all its tokens.
export const combatEntriesForSelection = (selection, scene, combat = null) => {
  const out = [];
  selection.forEach(s => {
    if (s.kind !== 'image' && isInCombat(combat, 'gameCharacter', s.id)) {
      out.push({ kind: 'gameCharacter', sourceId: s.id });
      return;
    }
    if (s.kind === 'image') {
      // Only tokens-layer images can join combat (backend enforces the same rule).
      if ((scene?.images || []).some(i => i.id === s.id && i.layer === 'tokens')) {
        out.push({ kind: 'image', sourceId: s.id });
      }
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
  combatEntriesForSelection(selection, scene, combat)
    .map(s => entryForSource(combat, s.kind, s.sourceId))
    .filter(Boolean);

const stripExtension = (name = '') => name.replace(/\.[^.]+$/, '');

// Scene tokens that can still join: character placements and tokens-layer images. A placement of a
// character already in combat from the character list is not offered again.
export const combatCandidates = (scene, combat) => [
  ...(scene?.characters || [])
    .filter(c => !isInCombat(combat, 'character', c.id) && !isInCombat(combat, 'gameCharacter', c.characterId))
    .map(c => ({ kind: 'character', sourceId: c.id, name: c.name, avatar: c.avatar })),
  ...(scene?.images || [])
    .filter(i => i.layer === 'tokens' && !isInCombat(combat, 'image', i.id))
    .map(i => ({ kind: 'image', sourceId: i.id, name: stripExtension(i.fileName), avatar: i.fileUrl })),
];

// Characters from the GM's character list (players' characters first, then NPCs) that are not on
// this scene — those are offered as scene tokens — and not in combat in any form: neither joined
// from the list nor through one of their tokens.
export const characterCandidates = (characters, scene, combat) => {
  const placementChar = new Map((scene?.characters || []).map(c => [c.id, c.characterId]));
  const onScene = new Set(placementChar.values());
  const taken = new Set(
    (combat?.entries || []).flatMap(e => {
      if (e.kind === 'gameCharacter') return [e.sourceId];
      if (e.kind === 'character' && placementChar.has(e.sourceId)) return [placementChar.get(e.sourceId)];
      return [];
    }),
  );
  return (characters || [])
    .filter(c => !taken.has(c.id) && !onScene.has(c.id))
    .sort((a, b) => Number(!!a.isNPC) - Number(!!b.isNPC))
    .map(c => ({
      kind: 'gameCharacter',
      sourceId: c.id,
      name: c.basicInfo?.name || c.name,
      avatar: c.avatar || c.basicInfo?.avatar,
    }));
};
