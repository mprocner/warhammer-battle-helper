import React from 'react';
import SceneImage from './SceneImage';

// No drag-measure callbacks here: SceneViewport renders this layer only for `background` and `gm`,
// and neither measures on a single image drag. The tokens layer goes through MapTokensLayer.
const SceneLayer = ({ images, layerName, isGM, gameId, sceneId, editingLayer, imageEditLayer, gameSystem, selectedImageId, onSelectImage, tokenPlacementMode = 'snap', isTokenSelected, onToggleTokenSelected, multiSelectActive, groupDragDelta, onGroupDragStart }) => {
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
          selected={selectedImageId === image.id}
          onSelectImage={onSelectImage}
          tokenPlacementMode={tokenPlacementMode}
          multiSelected={isTokenSelected?.('image', image.id)}
          multiSelectActive={multiSelectActive}
          onToggleSelect={onToggleTokenSelected}
          groupDragDelta={groupDragDelta}
          onGroupDragStart={onGroupDragStart}
        />
      ))}
    </div>
  );
};

export default SceneLayer;
