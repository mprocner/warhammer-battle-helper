import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getScenes, createScene, updateScene, deleteScene, assignPlayerToScene, toggleFog } from '../../api/scenes';
import OpenWithIcon from '@mui/icons-material/OpenWith';
import CloudIcon from '@mui/icons-material/Cloud';
import EditIcon from '@mui/icons-material/Edit';
import './ScenesTab.css';

const ScenesTab = ({ gameId, token, gameState, isConnected, currentSceneId, onSceneChange, editingLayer, onEditingLayerChange }) => {
  const { t } = useTranslation();
  const [scenes, setScenes] = useState([]);
  const selectedSceneId = currentSceneId || null;
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Create scene form
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newSceneName, setNewSceneName] = useState('');
  const [newSceneWidth, setNewSceneWidth] = useState('20');
  const [newSceneHeight, setNewSceneHeight] = useState('20');

  // Draft states for grid dimension inputs (updated on blur, not on every keystroke)
  const [draftGridWidth, setDraftGridWidth] = useState('');
  const [draftGridHeight, setDraftGridHeight] = useState('');
  const [gridSizeError, setGridSizeError] = useState(false);
  const [createGridError, setCreateGridError] = useState(false);

  // Modal drag & minimize
  const [isMinimized, setIsMinimized] = useState(false);
  const [modalPos, setModalPos] = useState({ x: Math.max(150, window.innerWidth / 2 - 200), y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const modalRef = useRef(null);

  const fetchScenes = useCallback(async () => {
    if (!gameId) return;
    try {
      setIsLoading(true);
      const data = await getScenes(gameId);
      setScenes(data || []);
      setError('');
    } catch (err) {
      console.error('Failed to fetch scenes:', err);
      setError(t('scenes.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [gameId, t]);

  useEffect(() => {
    fetchScenes();
  }, [fetchScenes]);

  // Refresh when game state changes (WS updates)
  useEffect(() => {
    if (gameState?.scenes) {
      setScenes(gameState.scenes);
    }
  }, [gameState?.scenes]);

  const selectedScene = scenes.find(s => s.id === selectedSceneId);

  // Sync draft grid inputs when selected scene changes or its data loads
  useEffect(() => {
    if (selectedScene) {
      setDraftGridWidth(String(selectedScene.gridWidth));
      setDraftGridHeight(String(selectedScene.gridHeight));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSceneId, selectedScene?.gridWidth, selectedScene?.gridHeight]);

  const participants = gameState?.participants?.filter(p => p.role === 'player') || [];

  const handleCreateScene = async (e) => {
    e.preventDefault();
    if (!newSceneName.trim()) return;

    try {
      const created = await createScene(gameId, {
        name: newSceneName.trim(),
        gridWidth: Math.min(50, Math.max(5, parseInt(newSceneWidth) || 20)),
        gridHeight: Math.min(50, Math.max(5, parseInt(newSceneHeight) || 20)),
      });
      setScenes(prev => [...prev, created]);
      setNewSceneName('');
      setNewSceneWidth('20');
      setNewSceneHeight('20');
      setIsCreateOpen(false);
      if (onSceneChange) onSceneChange(created.id);
    } catch (err) {
      console.error('Failed to create scene:', err);
      setError(t('scenes.createError'));
    }
  };

  const handleDeleteScene = async (sceneId) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!window.confirm(t('scenes.confirmDelete', { name: scene?.name }))) return;

    try {
      await deleteScene(gameId, sceneId);
      setScenes(prev => prev.filter(s => s.id !== sceneId));
      if (selectedSceneId === sceneId && onSceneChange) {
        onSceneChange(null);
      }
    } catch (err) {
      console.error('Failed to delete scene:', err);
      setError(t('scenes.deleteError'));
    }
  };

  const handleUpdateScene = async (field, value) => {
    if (!selectedSceneId) return;
    try {
      await updateScene(gameId, selectedSceneId, { [field]: value });
      setScenes(prev => prev.map(s =>
        s.id === selectedSceneId ? { ...s, [field]: value } : s
      ));
    } catch (err) {
      console.error('Failed to update scene:', err);
      setError(t('scenes.updateError'));
    }
  };

  const handleTogglePlayer = async (playerId) => {
    if (!selectedScene) return;
    const isAssigned = selectedScene.assignedPlayers?.includes(playerId);

    try {
      await assignPlayerToScene(gameId, selectedSceneId, playerId, !isAssigned);
      // Update local state
      setScenes(prev => prev.map(s => {
        if (s.id !== selectedSceneId) {
          // Remove player from other scenes
          if (!isAssigned) {
            return {
              ...s,
              assignedPlayers: (s.assignedPlayers || []).filter(id => id !== playerId)
            };
          }
          return s;
        }
        // Toggle in selected scene
        const players = s.assignedPlayers || [];
        return {
          ...s,
          assignedPlayers: isAssigned
            ? players.filter(id => id !== playerId)
            : [...players, playerId]
        };
      }));
    } catch (err) {
      console.error('Failed to toggle player assignment:', err);
      setError(t('scenes.assignError'));
    }
  };

  const handleToggleFog = async (enabled) => {
    if (!selectedSceneId) return;
    try {
      await toggleFog(gameId, selectedSceneId, { enabled, fogOpacity: selectedScene?.fogOpacity || 0.85 });
      setScenes(prev => prev.map(s =>
        s.id === selectedSceneId ? { ...s, fogEnabled: enabled } : s
      ));
    } catch (err) {
      console.error('Failed to toggle fog:', err);
      setError(t('scenes.updateError'));
    }
  };

  // Modal drag handlers
  const handleModalMouseDown = (e) => {
    if (e.target.closest('.scenes-tab__modal-header') && !e.target.closest('.scenes-tab__modal-header-buttons')) {
      setIsDragging(true);
      const rect = modalRef.current.getBoundingClientRect();
      setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e) => {
      setModalPos({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
    };
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Reset modal state when opening
  useEffect(() => {
    if (isCreateOpen) {
      setIsMinimized(false);
      setModalPos({ x: Math.max(150, window.innerWidth / 2 - 200), y: 80 });
    }
  }, [isCreateOpen]);

  if (isLoading) {
    return (
      <div className="scenes-tab scenes-tab--loading">
        <div className="loading-spinner" />
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  return (
    <div className="scenes-tab">
      {/* Header */}
      <div className="scenes-tab__header">
        <h3 className="scenes-tab__title">{t('scenes.title')}</h3>
        <button
          className="scenes-tab__btn"
          onClick={() => setIsCreateOpen(true)}
        >
          + {t('scenes.createScene')}
        </button>
      </div>

      {error && (
        <div className="scenes-tab__error">
          <span>{error}</span>
          <button onClick={() => setError('')}>&times;</button>
        </div>
      )}

      {/* Scene list + settings scrollable area */}
      <div className="scenes-tab__content">
        <div className="scenes-tab__list">
          {scenes.length === 0 ? (
            <div className="scenes-tab__empty">
              <p>{t('scenes.noScenes')}</p>
            </div>
          ) : (
            scenes.map(scene => (
              <div
                key={scene.id}
                className={`scenes-tab__card ${selectedSceneId === scene.id ? 'scenes-tab__card--selected' : ''}`}
                onClick={() => onSceneChange && onSceneChange(scene.id === selectedSceneId ? null : scene.id)}
              >
                <div className="scenes-tab__card-header">
                  <span className="scenes-tab__card-name">
                    {scene.name}
                    {scene.isDefault && <span className="scenes-tab__badge">{t('scenes.default')}</span>}
                  </span>
                  <span className="scenes-tab__card-info">
                    {scene.gridWidth}x{scene.gridHeight} · {(scene.assignedPlayers || []).length} {t('scenes.players')}
                  </span>
                </div>
                {!scene.isDefault && (
                  <button
                    className="scenes-tab__card-delete"
                    onClick={(e) => { e.stopPropagation(); handleDeleteScene(scene.id); }}
                    title={t('common.delete')}
                  >
                    🗑️
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Selected scene settings */}
        {selectedScene && (
        <div className="scenes-tab__settings">
          <h4 className="scenes-tab__settings-title">{t('scenes.sceneSettings')}</h4>

          {/* Editing layer toggle */}
          <div className="scenes-tab__field">
            <label>{t('scenes.editingLayer')}</label>
            <div className="scenes-tab__layer-toggle">
              {[
                { value: 'grid',    label: t('scenes.sceneLayer'),   Icon: OpenWithIcon },
                { value: 'fog',     label: t('scenes.fogLayer'),     Icon: CloudIcon },
                { value: 'drawing', label: t('scenes.drawingLayer'), Icon: EditIcon },
              ].map(({ value, label, Icon }) => (
                <button
                  key={value}
                  className={`scenes-tab__layer-btn ${editingLayer === value ? 'scenes-tab__layer-btn--active' : ''}`}
                  onClick={() => onEditingLayerChange(value)}
                  title={label}
                >
                  <Icon style={{ fontSize: 16 }} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="scenes-tab__field">
            <label>{t('scenes.name')}</label>
            <input
              type="text"
              value={selectedScene.name}
              onChange={(e) => handleUpdateScene('name', e.target.value)}
            />
          </div>

          {/* Grid dimensions */}
          <div className="scenes-tab__field-row">
            <div className="scenes-tab__field">
              <label>{t('scenes.gridWidth')}</label>
              <input
                type="number"
                min="5"
                max="50"
                value={draftGridWidth}
                onChange={(e) => { setDraftGridWidth(e.target.value); setGridSizeError(parseInt(e.target.value) > 50); }}
                onBlur={() => {
                  const clamped = Math.min(50, Math.max(5, parseInt(draftGridWidth) || 5));
                  setDraftGridWidth(String(clamped));
                  setGridSizeError(false);
                  handleUpdateScene('gridWidth', clamped);
                }}
              />
            </div>
            <div className="scenes-tab__field">
              <label>{t('scenes.gridHeight')}</label>
              <input
                type="number"
                min="5"
                max="50"
                value={draftGridHeight}
                onChange={(e) => { setDraftGridHeight(e.target.value); setGridSizeError(parseInt(e.target.value) > 50); }}
                onBlur={() => {
                  const clamped = Math.min(50, Math.max(5, parseInt(draftGridHeight) || 5));
                  setDraftGridHeight(String(clamped));
                  setGridSizeError(false);
                  handleUpdateScene('gridHeight', clamped);
                }}
              />
            </div>
          </div>
          {gridSizeError && (
            <p className="scenes-tab__grid-error">{t('scenes.gridSizeError')}</p>
          )}

          {/* Grid visibility */}
          <div className="scenes-tab__field scenes-tab__field--checkbox">
            <label>
              <input
                type="checkbox"
                checked={selectedScene.gridVisible}
                onChange={(e) => handleUpdateScene('gridVisible', e.target.checked)}
              />
              {t('scenes.showGrid')}
            </label>
          </div>

          {/* Fog of War section */}

            <div className="scenes-tab__field scenes-tab__field--checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={selectedScene.fogEnabled || false}
                  onChange={(e) => handleToggleFog(e.target.checked)}
                />
                {t('scenes.fogEnabled')}
              </label>
            </div>

          {/* Player assignment */}
          <div className="scenes-tab__field">
            <label>{t('scenes.assignedPlayers')}</label>
            <div className="scenes-tab__players">
              {participants.length === 0 ? (
                <span className="scenes-tab__no-players">{t('scenes.noPlayers')}</span>
              ) : (
                participants.map(p => {
                  const isAssigned = selectedScene.assignedPlayers?.includes(p.userId);
                  return (
                    <label key={p.userId} className="scenes-tab__player-checkbox">
                      <input
                        type="checkbox"
                        checked={isAssigned}
                        onChange={() => handleTogglePlayer(p.userId)}
                      />
                      <span>{p.username}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Scene stats */}
          <div className="scenes-tab__stats">
            <span>{t('scenes.characters')}: {(selectedScene.characters || []).length}</span>
            <span>{t('scenes.images')}: {(selectedScene.images || []).length}</span>
          </div>
        </div>
      )}
      </div>

      {/* Create scene modal */}
      {isCreateOpen && (
        <div
          ref={modalRef}
          className={`scenes-tab__modal ${isMinimized ? 'scenes-tab__modal--minimized' : ''}`}
          style={{ left: `${modalPos.x}px`, top: `${modalPos.y}px` }}
          onMouseDown={handleModalMouseDown}
        >
          <div
            className="scenes-tab__modal-header"
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            <h4>{t('scenes.createScene')}</h4>
            <div className="scenes-tab__modal-header-buttons">
              <button
                className="scenes-tab__modal-minimize-btn"
                onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
                title={isMinimized ? t('common.expand') : t('common.minimize')}
              >
                {isMinimized ? '▢' : '─'}
              </button>
              <button
                className="scenes-tab__modal-close-btn"
                onClick={(e) => { e.stopPropagation(); setIsCreateOpen(false); }}
              >
                ×
              </button>
            </div>
          </div>
          {!isMinimized && (
            <form onSubmit={handleCreateScene}>
              <div className="scenes-tab__field">
                <label>{t('scenes.name')}</label>
                <input
                  type="text"
                  value={newSceneName}
                  onChange={(e) => setNewSceneName(e.target.value)}
                  placeholder={t('scenes.namePlaceholder')}
                  autoFocus
                />
              </div>
              <div className="scenes-tab__field-row">
                <div className="scenes-tab__field">
                  <label>{t('scenes.gridWidth')}</label>
                  <input
                    type="number"
                    min="5"
                    max="50"
                    value={newSceneWidth}
                    onChange={(e) => { setNewSceneWidth(e.target.value); setCreateGridError(parseInt(e.target.value) > 50); }}
                    onBlur={() => { setNewSceneWidth(String(Math.min(50, Math.max(5, parseInt(newSceneWidth) || 20)))); setCreateGridError(false); }}
                  />
                </div>
                <div className="scenes-tab__field">
                  <label>{t('scenes.gridHeight')}</label>
                  <input
                    type="number"
                    min="5"
                    max="50"
                    value={newSceneHeight}
                    onChange={(e) => { setNewSceneHeight(e.target.value); setCreateGridError(parseInt(e.target.value) > 50); }}
                    onBlur={() => { setNewSceneHeight(String(Math.min(50, Math.max(5, parseInt(newSceneHeight) || 20)))); setCreateGridError(false); }}
                  />
                </div>
              </div>
              {createGridError && (
                <p className="scenes-tab__grid-error">{t('scenes.gridSizeError')}</p>
              )}
              <div className="scenes-tab__modal-actions">
                <button type="button" onClick={() => setIsCreateOpen(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" disabled={!newSceneName.trim()}>
                  {t('common.create')}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

export default ScenesTab;
