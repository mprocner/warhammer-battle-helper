import React from 'react';
import SceneImage from './SceneImage';

const SceneLayer = ({ images, layerName, isGM, gameId, sceneId, editingLayer, imageEditLayer, gameSystem, selectedImageTokenId, onSelectImageToken, tokenPlacementMode = 'snap', onTokenDragMeasureStart, onTokenDragMeasureMove, onTokenDragMeasureEnd }) => {
  const sortedImages = [...images].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  // background sits under the grid, tokens just above it, gm on top.
  const zIndex = layerName === 'background' ? 1 : layerName === 'tokens' ? 5 : 10;

  return (
    <div
      className={`scene-layer scene-layer--${layerName}`}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex,
        pointerEvents: 'none',
      }}
    >
      {sortedImages.map(image => (
        <SceneImage
          key={image.id}
          image={image}
          isGM={isGM}
          gameId={gameId}
          sceneId={sceneId}
          editingLayer={editingLayer}
          imageEditLayer={imageEditLayer}
          gameSystem={gameSystem}
          selected={selectedImageTokenId === image.id}
          onSelectImageToken={onSelectImageToken}
          tokenPlacementMode={tokenPlacementMode}
          onTokenDragMeasureStart={onTokenDragMeasureStart}
          onTokenDragMeasureMove={onTokenDragMeasureMove}
          onTokenDragMeasureEnd={onTokenDragMeasureEnd}
        />
      ))}
    </div>
  );
};

export default SceneLayer;
