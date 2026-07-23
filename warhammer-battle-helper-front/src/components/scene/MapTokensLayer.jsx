import React from 'react';
import SceneImage from './SceneImage';
import MapCharacterToken from './MapCharacterToken';

// The unified tokens layer: character tokens and token-layer images share one z-ordered space.
// Images keep rendering through the existing SceneImage; characters render as MapCharacterToken.
// Replaces the old tokens SceneLayer + the separate character grid layer.
const MapTokensLayer = ({
  characters = [], images = [],
  isGM, gameId, sceneId, gameSystem, editingLayer, imageEditLayer, activeTool,
  tokenPlacementMode = 'snap',
  selectedImageTokenId, onSelectImageToken,
  onTokenDragMeasureStart, onTokenDragMeasureMove, onTokenDragMeasureEnd,
  // character-specific
  isMultiplayer = false, tokenDisplay, token,
  activeTokenId, onSelectCharacter, onCommitMove, onCommitResize,
}) => {
  const items = [
    ...characters.map(c => ({ kind: 'character', zIndex: c.zIndex || 0, key: `c:${c.character.id}`, data: c })),
    ...images.map(img => ({ kind: 'image', zIndex: img.zIndex || 0, key: `i:${img.id}`, data: img })),
  ].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div className="map-tokens-layer" style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
      {items.map(item => item.kind === 'image' ? (
        <SceneImage
          key={item.key}
          image={item.data}
          isGM={isGM}
          gameId={gameId}
          sceneId={sceneId}
          editingLayer={editingLayer}
          imageEditLayer={imageEditLayer}
          gameSystem={gameSystem}
          selected={selectedImageTokenId === item.data.id}
          onSelectImageToken={onSelectImageToken}
          tokenPlacementMode={tokenPlacementMode}
          activeTool={activeTool}
          onTokenDragMeasureStart={onTokenDragMeasureStart}
          onTokenDragMeasureMove={onTokenDragMeasureMove}
          onTokenDragMeasureEnd={onTokenDragMeasureEnd}
        />
      ) : (
        <MapCharacterToken
          key={item.key}
          character={item.data.character}
          col={item.data.col}
          row={item.data.row}
          w={item.data.w}
          h={item.data.h}
          isGM={isGM}
          isMultiplayer={isMultiplayer}
          canDrag={item.data.canDrag}
          selected={activeTokenId === item.data.character.id}
          tokenPlacementMode={tokenPlacementMode}
          sceneId={sceneId}
          hidden={item.data.hidden}
          placementId={item.data.placementId}
          tokenGear={item.data.tokenGear}
          tokenView={item.data.tokenView}
          gameSystem={gameSystem}
          editingLayer={editingLayer}
          activeTool={activeTool}
          tokenDisplay={tokenDisplay}
          gameId={gameId}
          token={token}
          onSelect={onSelectCharacter}
          onCommitMove={onCommitMove}
          onCommitResize={onCommitResize}
          onTokenDragMeasureStart={onTokenDragMeasureStart}
          onTokenDragMeasureMove={onTokenDragMeasureMove}
          onTokenDragMeasureEnd={onTokenDragMeasureEnd}
        />
      ))}
    </div>
  );
};

export default MapTokensLayer;
