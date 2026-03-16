import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PersonIcon from '@mui/icons-material/Person';
import AddIcon from '@mui/icons-material/Add';
import { useTranslation } from 'react-i18next';
import { createScene, assignPlayerToScene } from '../../api/scenes';
import './SceneViewport.css';

const SceneSelector = ({
  scenes,
  activeSceneId,
  onSceneChange,
  participants,
  gameId,
  onSceneCreated,
}) => {
  const { t } = useTranslation();
  const [openPopoverSceneId, setOpenPopoverSceneId] = useState(null);
  const [popoverAnchor, setPopoverAnchor] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [tooltip, setTooltip] = useState(null);
  const tooltipTimeout = useRef(null);
  const popoverRef = useRef(null);

  const players = (participants || []).filter(p => p.role === 'player');

  // Close popover on outside click
  useEffect(() => {
    if (!openPopoverSceneId) return;
    const handleMouseDown = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setOpenPopoverSceneId(null);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [openPopoverSceneId]);

  const showTooltip = useCallback((text, el) => {
    clearTimeout(tooltipTimeout.current);
    tooltipTimeout.current = setTimeout(() => {
      const rect = el.getBoundingClientRect();
      setTooltip({ text, top: rect.top + rect.height / 2, left: rect.left });
    }, 400);
  }, []);

  const hideTooltip = useCallback(() => {
    clearTimeout(tooltipTimeout.current);
    setTooltip(null);
  }, []);

  const handlePersonClick = (e, scene) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    if (openPopoverSceneId === scene.id) {
      setOpenPopoverSceneId(null);
    } else {
      setOpenPopoverSceneId(scene.id);
      setPopoverAnchor({ top: rect.bottom + 4, left: rect.left });
    }
  };

  const isAssigned = (scene, player) =>
    (scene.assignedPlayers || []).includes(player.userId);

  const handleTogglePlayer = async (scene, player) => {
    const assign = !isAssigned(scene, player);
    try {
      await assignPlayerToScene(gameId, scene.id, player.userId, assign);
    } catch (err) {
      console.error('Failed to assign player', err);
    }
  };

  const handleAssignAll = async (scene) => {
    const unassigned = players.filter(p => !isAssigned(scene, p));
    try {
      await Promise.all(unassigned.map(p => assignPlayerToScene(gameId, scene.id, p.userId, true)));
    } catch (err) {
      console.error('Failed to assign all players', err);
    }
  };

  const handleQuickCreate = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const created = await createScene(gameId, {
        name: `Scene ${scenes.length + 1}`,
        gridWidth: 20,
        gridHeight: 20,
      });
      onSceneCreated?.(created.id);
    } catch (err) {
      console.error('Failed to create scene', err);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="scene-selector-wrapper">
    <div className={`scene-selector${collapsed ? ' scene-selector--collapsed' : ''}`}>
      <div className="scene-selector__tabs">
        {scenes.map(scene => {
          const assignedCount = (scene.assignedPlayers || []).length;
          return (
            <div key={scene.id} className="scene-selector__tab-wrapper">
              <button
                className={`scene-selector__tab ${scene.id === activeSceneId ? 'scene-selector__tab--active' : ''}`}
                onClick={() => onSceneChange(scene.id)}
              >
                {scene.name}
                {assignedCount > 0 && (
                  <span className="scene-selector__badge scene-selector__badge--filled">
                    {assignedCount}
                  </span>
                )}
              </button>
              <button
                className="scene-selector__person-btn"
                onClick={(e) => handlePersonClick(e, scene)}
                onMouseEnter={e => showTooltip(t('scenes.assignPlayers'), e.currentTarget)}
                onMouseLeave={hideTooltip}
              >
                <PersonIcon style={{ fontSize: 16 }} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="scene-selector__actions">
        <button
          className="scene-selector__action-btn"
          onClick={handleQuickCreate}
          disabled={isCreating}
          onMouseEnter={e => showTooltip(t('scenes.addScene'), e.currentTarget)}
          onMouseLeave={hideTooltip}
        >
          <AddIcon style={{ fontSize: 18 }} />
        </button>
      </div>

      {/* Player assignment popover */}
      {openPopoverSceneId && popoverAnchor && createPortal(
        <div
          ref={popoverRef}
          className="scene-selector__popover"
          style={{ top: popoverAnchor.top, left: popoverAnchor.left }}
        >
          {players.length === 0 ? (
            <div className="scene-selector__popover-empty">{t('scenes.noPlayers')}</div>
          ) : (
            <>
              {(() => {
                const scene = scenes.find(s => s.id === openPopoverSceneId);
                const allAssigned = scene && players.every(p => isAssigned(scene, p));
                return (
                  <>
                    {players.map(p => (
                      <label key={p.userId} className="scene-selector__popover-row">
                        <input
                          type="checkbox"
                          checked={scene ? isAssigned(scene, p) : false}
                          onChange={() => scene && handleTogglePlayer(scene, p)}
                        />
                        {p.username}
                      </label>
                    ))}
                    {!allAssigned && (
                      <div className="scene-selector__popover-footer">
                        <button
                          className="scene-selector__popover-all-btn"
                          onClick={() => {
                            const s = scenes.find(sc => sc.id === openPopoverSceneId);
                            if (s) handleAssignAll(s);
                          }}
                        >
                          {t('scenes.assignAllPlayers')}
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </div>,
        document.body
      )}

    </div>

    {/* Edge toggle — attached to bottom of bar, protrudes into viewport */}
    <button
      className="scene-selector__edge-toggle"
      onClick={() => setCollapsed(v => !v)}
      title={collapsed ? t('scenes.title') : t('scenes.collapseBar')}
    >
      {collapsed ? '▼' : '▲'}
    </button>

    {/* Tooltip */}
    {tooltip && createPortal(
      <div
        className="portal-tooltip"
        style={{ top: tooltip.top, left: tooltip.left, transform: 'translate(-100%, -50%)' }}
      >
        <span className="portal-tooltip__arrow" />
        {tooltip.text}
      </div>,
      document.body
    )}
    </div>
  );
};

export default SceneSelector;
