// Merges SCENE_CHARACTER_TOKEN_VIEW_UPDATED entries into game state.
//
// A player who does not hold a character's card renders that token from `tokenView` — a projection
// the server bakes and masks. It used to be produced only by a full game GET, so the GM's live value
// changes stayed invisible to those players until the next refetch (FEATURE-183).
//
// Merging in place is safe here precisely because this event cannot change WHICH tokens the viewer
// may see: that rule lives server-side in FilterSceneCharacterTokensForUser, and every change that
// touches it (hiding a token, granting a card) still goes through a full refetch instead.
export function applyTokenViewPatch(gameState, views = []) {
  if (!gameState || !views || views.length === 0) return gameState;

  const byPlacement = new Map(views.map(v => [v.placementId, v]));

  return {
    ...gameState,
    scenes: (gameState.scenes || []).map(scene => {
      let touched = false;
      const characters = (scene.characters || []).map(c => {
        const v = byPlacement.get(c.id);
        if (!v) return c;
        touched = true;
        return { ...c, name: v.name, avatar: v.avatar, killed: v.killed, tokenView: v.tokenView };
      });
      return touched ? { ...scene, characters } : scene;
    }),
  };
}
