import React from 'react';
import './SceneViewport.css';

const SceneSelector = ({ scenes, activeSceneId, onSceneChange }) => {
  if (!scenes || scenes.length === 0) return null;

  return (
    <div className="scene-selector">
      {scenes.map(scene => (
        <button
          key={scene.id}
          className={`scene-selector__tab ${scene.id === activeSceneId ? 'scene-selector__tab--active' : ''}`}
          onClick={() => onSceneChange(scene.id)}
        >
          {scene.name}
          <span className="scene-selector__badge">
            {(scene.assignedPlayers || []).length}
          </span>
        </button>
      ))}
    </div>
  );
};

export default SceneSelector;
