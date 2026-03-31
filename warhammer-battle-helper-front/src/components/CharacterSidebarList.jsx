import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import CharacterTile from './CharacterTile';

const CharacterSidebarList = ({
  initialCharacters, isGM, userId, participants,
  selectedCharacter, fightZones,
  pcListCollapsed, npcListCollapsed,
  onPCCollapseToggle, onNPCCollapseToggle,
  characterTileRefs,
  onSelect, onGridToggle,
  onAddCharacter, onAddNPC,
  onClone, onVisibility, onDelete,
  gameId,
}) => {
  const { t } = useTranslation();
  const [tooltip, setTooltip] = useState(null);
  const tooltipTimeout = useRef(null);

  const showTooltip = useCallback((text, el) => {
    clearTimeout(tooltipTimeout.current);
    const rect = el.getBoundingClientRect();
    setTooltip({ top: rect.top, left: rect.left + rect.width / 2, text });
  }, []);

  const hideTooltip = useCallback(() => {
    tooltipTimeout.current = setTimeout(() => setTooltip(null), 100);
  }, []);

  const pcCharacters = (initialCharacters || []).filter(c => !c.isNPC);
  const npcCharacters = (initialCharacters || []).filter(c => c.isNPC);
  const isOnGrid = (charId) => fightZones.some(z => z.character?.id === charId);

  const renderTile = (char) => (
    <CharacterTile
      key={char.id}
      char={char}
      isGM={isGM}
      userId={userId}
      participants={participants}
      isSelected={selectedCharacter?.id === char.id}
      onGrid={isOnGrid(char.id)}
      tileRef={el => { if (el) characterTileRefs.current[char.id] = el; else delete characterTileRefs.current[char.id]; }}
      onSelect={onSelect}
      onGridToggle={onGridToggle}
      onClone={onClone}
      onVisibility={onVisibility}
      onDelete={onDelete}
      showTooltip={showTooltip}
      hideTooltip={hideTooltip}
    />
  );

  return (
    <>
      <div className="characters-list">
        {/* PC Section */}
        <div className="characters-list-header">
          <div className="characters-list-header-left" onClick={onPCCollapseToggle}>
            <button className="section-collapse-btn">{pcListCollapsed ? '▶' : '▼'}</button>
            <h3>{t('leftPanel.yourCharacters')}</h3>
          </div>
          {gameId && (
            <button className="add-character-btn" onClick={onAddCharacter}>
              + {t('character.addCharacter')}
            </button>
          )}
        </div>
        {!pcListCollapsed && (
          <div className="characters-list-content">
            {pcCharacters.map(renderTile)}
          </div>
        )}

        {/* NPC Section (GM only) */}
        {isGM && (
          <>
            <div className="characters-list-header characters-list-header--npc">
              <div className="characters-list-header-left" onClick={onNPCCollapseToggle}>
                <button className="section-collapse-btn">{npcListCollapsed ? '▶' : '▼'}</button>
                <h3>{t('leftPanel.npcList')}</h3>
              </div>
              <button className="add-character-btn" onClick={onAddNPC}>
                + {t('character.addCharacter')}
              </button>
            </div>
            {!npcListCollapsed && (
              <div className="characters-list-content">
                {npcCharacters.map(renderTile)}
              </div>
            )}
          </>
        )}
      </div>

      {tooltip && createPortal(
        <div className="portal-tooltip portal-tooltip--above" style={{ top: tooltip.top, left: tooltip.left }}>
          {tooltip.text}
          <div className="portal-tooltip__arrow" />
        </div>,
        document.body
      )}
    </>
  );
};

export default CharacterSidebarList;
