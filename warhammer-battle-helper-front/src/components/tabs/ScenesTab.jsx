import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getScenes, createScene, updateScene, deleteScene, assignPlayerToScene, toggleFog } from '../../api/scenes';
import { getMusic } from '../../api/music';
import { resolveDisplayName } from '../../utils/participants';
import OpenWithIcon from '@mui/icons-material/OpenWith';
import CloudIcon from '@mui/icons-material/Cloud';
import EditIcon from '@mui/icons-material/Edit';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import QueueMusicIcon from '@mui/icons-material/QueueMusic';
import ModalHeader from '../common/ModalHeader';
import CloseIcon from '@mui/icons-material/Close';
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
  const [draftName, setDraftName] = useState('');
  const [draftGridWidth, setDraftGridWidth] = useState('');
  const [draftGridHeight, setDraftGridHeight] = useState('');
  const [gridSizeError, setGridSizeError] = useState(false);
  const [createGridError, setCreateGridError] = useState(false);

  // Music picker state
  const [isMusicPickerOpen, setIsMusicPickerOpen] = useState(false);
  const [musicPickerData, setMusicPickerData] = useState(null);
  const [musicPickerSearch, setMusicPickerSearch] = useState('');
  const [musicPickerLoading, setMusicPickerLoading] = useState(false);

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
      setDraftName(selectedScene.name);
      setDraftGridWidth(String(selectedScene.gridWidth));
      setDraftGridHeight(String(selectedScene.gridHeight));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSceneId, selectedScene?.name, selectedScene?.gridWidth, selectedScene?.gridHeight]);

  // Close music picker when switching scenes
  useEffect(() => {
    setIsMusicPickerOpen(false);
  }, [selectedSceneId]);

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

  const handleAssignAllPlayers = async () => {
    if (!selectedScene) return;
    const unassigned = participants.filter(p => !selectedScene.assignedPlayers?.includes(p.userId));
    try {
      await Promise.all(unassigned.map(p => assignPlayerToScene(gameId, selectedSceneId, p.userId, true)));
      const allIds = participants.map(p => p.userId);
      setScenes(prev => prev.map(s => {
        if (s.id === selectedSceneId) {
          return { ...s, assignedPlayers: allIds };
        }
        // Remove these players from other scenes
        return { ...s, assignedPlayers: (s.assignedPlayers || []).filter(id => !allIds.includes(id)) };
      }));
    } catch (err) {
      console.error('Failed to assign all players:', err);
      setError(t('scenes.assignError'));
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

  const handleOpenMusicPicker = async () => {
    setIsMusicPickerOpen(true);
    setMusicPickerSearch('');
    if (musicPickerData) return;
    setMusicPickerLoading(true);
    try {
      const data = await getMusic();
      setMusicPickerData(data);
    } catch {
      setError(t('scenes.musicLoadError'));
      setIsMusicPickerOpen(false);
    } finally {
      setMusicPickerLoading(false);
    }
  };

  const handleLinkMusic = async (id, type, name) => {
    if (!selectedSceneId) return;
    try {
      await updateScene(gameId, selectedSceneId, { sceneMusicId: id, sceneMusicType: type, sceneMusicName: name, sceneMusicLoop: true });
      setScenes(prev => prev.map(s =>
        s.id === selectedSceneId ? { ...s, sceneMusicId: id, sceneMusicType: type, sceneMusicName: name, sceneMusicLoop: true } : s
      ));
      setIsMusicPickerOpen(false);
    } catch {
      setError(t('scenes.updateError'));
    }
  };

  const handleUnlinkMusic = async () => {
    if (!selectedSceneId) return;
    try {
      await updateScene(gameId, selectedSceneId, { sceneMusicId: '', sceneMusicType: '', sceneMusicName: '' });
      setScenes(prev => prev.map(s =>
        s.id === selectedSceneId ? { ...s, sceneMusicId: undefined, sceneMusicType: undefined, sceneMusicName: undefined } : s
      ));
    } catch {
      setError(t('scenes.updateError'));
    }
  };

  // Modal drag handlers
  const handleModalMouseDown = (e) => {
    if (e.target.closest('.modal-header') && !e.target.closest('.modal-header__buttons')) {
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
                onClick={() => onSceneChange && onSceneChange(scene.id)}
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
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={() => {
                const trimmed = draftName.trim();
                if (trimmed && trimmed !== selectedScene.name) {
                  handleUpdateScene('name', trimmed);
                } else {
                  setDraftName(selectedScene.name); // przywróć poprzednią, gdy puste
                }
              }}
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
            <div className="scenes-tab__players-header">
              <label>{t('scenes.assignedPlayers')}</label>
              {participants.length > 0 && (
                <button
                  className="scenes-tab__btn scenes-tab__btn--sm"
                  onClick={handleAssignAllPlayers}
                >
                  {t('scenes.assignAllPlayers')}
                </button>
              )}
            </div>
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
                      <span>{resolveDisplayName(p) || p.username}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Linked music */}
          <div className="scenes-tab__music-field">
            <label>{t('scenes.linkedMusic')}</label>
            {selectedScene.sceneMusicId ? (
              <>
                <div className="scenes-tab__music-linked">
                  {selectedScene.sceneMusicType === 'playlist'
                    ? <QueueMusicIcon style={{ fontSize: 16 }} />
                    : <MusicNoteIcon style={{ fontSize: 16 }} />
                  }
                  <span className="scenes-tab__music-linked-name">{selectedScene.sceneMusicName}</span>
                  <button className="scenes-tab__music-unlink-btn" onClick={handleUnlinkMusic} title={t('scenes.unlinkMusic')}>
                    <CloseIcon style={{ fontSize: 14 }} />
                  </button>
                </div>
                <label className="scenes-tab__music-loop">
                  <input
                    type="checkbox"
                    checked={selectedScene.sceneMusicLoop !== false}
                    onChange={async (e) => {
                      const loop = e.target.checked;
                      setScenes(prev => prev.map(s =>
                        s.id === selectedSceneId ? { ...s, sceneMusicLoop: loop } : s
                      ));
                      await updateScene(gameId, selectedSceneId, { sceneMusicLoop: loop });
                    }}
                  />
                  {t('scenes.musicLoop')}
                </label>
              </>
            ) : (
              <div className="scenes-tab__music-empty">
                <span>{t('scenes.noMusicLinked')}</span>
                <button className="scenes-tab__btn scenes-tab__btn--sm" onClick={handleOpenMusicPicker}>
                  {t('scenes.linkMusic')}
                </button>
              </div>
            )}
            {isMusicPickerOpen && (
              <div className="scenes-tab__music-picker">
                <input
                  className="scenes-tab__music-picker-search"
                  type="text"
                  placeholder={t('scenes.musicSearch')}
                  value={musicPickerSearch}
                  onChange={e => setMusicPickerSearch(e.target.value)}
                  autoFocus
                />
                {musicPickerLoading ? (
                  <div className="scenes-tab__music-picker-empty">{t('common.loading')}</div>
                ) : (
                  <div className="scenes-tab__music-picker-list">
                    {(() => {
                      const search = musicPickerSearch.toLowerCase();
                      const playlists = (musicPickerData?.playlists || []).filter(p => p.name.toLowerCase().includes(search));
                      const tracks = (musicPickerData?.music || []).filter(f => f.name.toLowerCase().includes(search));
                      if (playlists.length === 0 && tracks.length === 0) {
                        return <div className="scenes-tab__music-picker-empty">{t('common.noResults', 'No results')}</div>;
                      }
                      return [
                        ...playlists.map(p => (
                          <button key={`pl-${p.id}`} className="scenes-tab__music-picker-item" onClick={() => handleLinkMusic(p.id, 'playlist', p.name)}>
                            <QueueMusicIcon style={{ fontSize: 14 }} />
                            <span className="scenes-tab__music-picker-item-name">{p.name}</span>
                          </button>
                        )),
                        ...tracks.map(f => (
                          <button key={`tr-${f.id}`} className="scenes-tab__music-picker-item" onClick={() => handleLinkMusic(f.id, 'track', f.name)}>
                            <MusicNoteIcon style={{ fontSize: 14 }} />
                            <span className="scenes-tab__music-picker-item-name">{f.name}</span>
                          </button>
                        )),
                      ];
                    })()}
                  </div>
                )}
              </div>
            )}
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
          <ModalHeader
            title={t('scenes.createScene')}
            onClose={() => setIsCreateOpen(false)}
            isMinimized={isMinimized}
            onToggleMinimize={() => setIsMinimized(v => !v)}
            isDragging={isDragging}
            draggable
            minimizeTitle={t('common.minimize')}
            expandTitle={t('common.expand')}
          />
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
