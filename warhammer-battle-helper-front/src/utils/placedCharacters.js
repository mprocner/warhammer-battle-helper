// Builds the character tokens the map layer renders, straight from the scene's server placements.
//
// The position comes from the placement (positionX/positionY, fractional cells) and NOT from the
// legacy whole-cell `fightZones` grid. That grid predates free placement and holds at most one
// character per cell, so sourcing tokens from it rounded free-mode positions to the nearest cell
// and dropped a token entirely whenever two of them rounded into the same cell. fightZones still
// answers "who is on the grid" for the sidebar and the snap-mode occupancy rule — it is just no
// longer the truth about where a token sits.
//
// resolveCharacter(id) returns the live Character document, or null for a viewer who does not hold
// the card; those placements still render, from a grid-only stub built out of the placement itself.
// canDrag(id) decides ownership; overrides carry optimistic geometry awaiting the server round trip.
export function buildPlacedCharacters(sceneCharacters = [], { resolveCharacter, canDrag, overrides = {} } = {}) {
  return sceneCharacters.map(sc => {
    const character = resolveCharacter?.(sc.characterId) || {
      id: sc.characterId,
      name: sc.name,
      avatar: sc.avatar,
      isEnemy: sc.isEnemy,
      killed: sc.killed,
      stats: {},
      gridOnly: true,
    };
    const ov = overrides[sc.characterId];
    return {
      character,
      col: sc.positionX || 0,
      row: sc.positionY || 0,
      w: ov?.w ?? (sc.w || 1),   // `|| 1`: pre-w/h placements store a zero value
      h: ov?.h ?? (sc.h || 1),
      rotation: ov?.rotation ?? (sc.rotation || 0),
      zIndex: sc.zIndex || 0,
      hidden: !!sc.hidden,
      placementId: sc.id,
      tokenGear: sc.tokenGear,   // raw per-token gear (GM/card-holder)
      tokenView: sc.tokenView,   // masked projection (card-less viewer)
      canDrag: !!canDrag?.(sc.characterId),
    };
  });
}
