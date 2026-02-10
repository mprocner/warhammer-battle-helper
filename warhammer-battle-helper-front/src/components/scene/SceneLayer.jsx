import React from 'react';
import SceneImage from './SceneImage';

const SceneLayer = ({ images, layerName, isGM, gameId, sceneId, editingLayer }) => {
  const sortedImages = [...images].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  const isActive = editingLayer === layerName;
  const baseZIndex = layerName === 'background' ? 1 : 10;
  const zIndex = isActive ? 20 : baseZIndex;

  return (
    <div
      className={`scene-layer scene-layer--${layerName}`}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex,
        pointerEvents: isActive ? 'auto' : 'none',
      }}
    >
      {sortedImages.map(image => (
        <SceneImage
          key={image.id}
          image={image}
          isGM={isGM}
          gameId={gameId}
          sceneId={sceneId}
        />
      ))}
    </div>
  );
};

export default SceneLayer;
