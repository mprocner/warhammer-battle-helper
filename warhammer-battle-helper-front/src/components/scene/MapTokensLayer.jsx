import React from 'react';
import SceneImage from './SceneImage';
import MapCharacterToken from './MapCharacterToken';

// The unified tokens layer: character tokens and token-layer images share one z-ordered space.
// Images keep rendering through the existing SceneImage; characters render as MapCharacterToken.
// Replaces the old tokens SceneLayer + the separate character grid layer.
const MapTokensLayer = ({
  characters = [], images = [],
  isGM, gameId, sceneId, gameSystem, editingLayer, imageEditLayer,
  tokenPlacementMode = 'snap',
  onTokenDragMeasureStart, onTokenDragMeasureMove, onTokenDragMeasureEnd,
  // character-specific
  isMultiplayer = false, tokenDisplay, token,
  onCommitMove, onCommitResize, onCommitRotate,
  isTokenSelected, onToggleTokenSelected, multiSelectActive,
  groupDragDelta, onGroupDragStart,
}) => {
  const items = [
    ...characters.map(c => ({ kind: 'character', zIndex: c.zIndex || 0, key: `c:${c.character.id}`, data: c })),
    ...images.map(img => ({ kind: 'image', zIndex: img.zIndex || 0, key: `i:${img.id}`, data: img })),
  ].sort((a, b) => a.zIndex - b.zIndex);
  // A lone selected token is raised to this while selected, so its ring sits above every other
  // token: the ring lives inside the token's own stacking context (an image is rotated), so only
  // raising the token itself gets it out. One above the highest z-index in the layer, because
  // bring-to-front has no upper bound.
  const topZIndex = Math.max(0, ...items.map(i => i.zIndex)) + 1;

  return (
    <div className="map-tokens-layer" style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
      {items.map(item => item.kind === 'image' ? (
        <SceneImage
          key={item.key}
          topZIndex={topZIndex}
          image={item.data}
          isGM={isGM}
          gameId={gameId}
          sceneId={sceneId}
          editingLayer={editingLayer}
          imageEditLayer={imageEditLayer}
          gameSystem={gameSystem}
          tokenPlacementMode={tokenPlacementMode}
          onTokenDragMeasureStart={onTokenDragMeasureStart}
          onTokenDragMeasureMove={onTokenDragMeasureMove}
          onTokenDragMeasureEnd={onTokenDragMeasureEnd}
          multiSelected={isTokenSelected?.('image', item.data.id)}
          multiSelectActive={multiSelectActive}
          onToggleSelect={onToggleTokenSelected}
          groupDragDelta={groupDragDelta}
          onGroupDragStart={onGroupDragStart}
        />
      ) : (
        <MapCharacterToken
          key={item.key}
          topZIndex={topZIndex}
          character={item.data.character}
          col={item.data.col}
          row={item.data.row}
          w={item.data.w}
          h={item.data.h}
          isGM={isGM}
          isMultiplayer={isMultiplayer}
          canDrag={item.data.canDrag}
          tokenPlacementMode={tokenPlacementMode}
          sceneId={sceneId}
          hidden={item.data.hidden}
          placementId={item.data.placementId}
          tokenGear={item.data.tokenGear}
          tokenView={item.data.tokenView}
          gameSystem={gameSystem}
          editingLayer={editingLayer}
          imageEditLayer={imageEditLayer}
          tokenDisplay={tokenDisplay}
          gameId={gameId}
          token={token}
          onCommitMove={onCommitMove}
          onCommitResize={onCommitResize}
          rotation={item.data.rotation}
          onCommitRotate={onCommitRotate}
          onTokenDragMeasureStart={onTokenDragMeasureStart}
          onTokenDragMeasureMove={onTokenDragMeasureMove}
          onTokenDragMeasureEnd={onTokenDragMeasureEnd}
          multiSelected={isTokenSelected?.('char', item.data.character.id)}
          multiSelectActive={multiSelectActive}
          onToggleSelect={onToggleTokenSelected}
          groupDragDelta={groupDragDelta}
          onGroupDragStart={onGroupDragStart}
        />
      ))}
    </div>
  );
};

export default MapTokensLayer;
