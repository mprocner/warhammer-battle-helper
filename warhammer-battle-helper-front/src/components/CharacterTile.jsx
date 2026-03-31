import React from 'react';
import { useTranslation } from 'react-i18next';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CloseIcon from '@mui/icons-material/Close';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { resolveDisplayName } from '../utils/participants';

const CharacterTile = ({
  char, isGM, userId, participants,
  isSelected, onGrid,
  tileRef,
  onSelect, onGridToggle, onClone, onVisibility, onDelete,
  showTooltip, hideTooltip,
}) => {
  const { t } = useTranslation();

  return (
    <div
      ref={tileRef}
      className={`character-tile ${isSelected ? 'selected' : ''} ${onGrid ? 'on-grid' : ''}`}
      onClick={() => onSelect(char)}
    >
      <div className="character-tile-header">
        <div className="character-name">{char.basicInfo?.name || char.name}</div>
        <div className="character-hp">
          {char.secondaryAttributes?.wounds?.current || '-'}/{char.secondaryAttributes?.wounds?.max || '-'} HP
        </div>
      </div>
      {isGM && char.createdBy && (
        <div className="character-owner">
          {(() => { const p = participants.find(p => p.userId === char.createdBy); return p ? (resolveDisplayName(p) || p.username) : 'GM'; })()}
        </div>
      )}
      <div className="character-position">
        {onGrid ? t('leftPanel.onGrid') : t('leftPanel.available')}
        <div className="character-actions">
          {isGM && (
            <>
              <button
                className="clone-btn"
                onClick={(e) => { e.stopPropagation(); onClone(char); }}
                onMouseEnter={e => showTooltip(t('character.clone'), e.currentTarget)}
                onMouseLeave={hideTooltip}
              >
                <ContentCopyIcon style={{ fontSize: 14 }} aria-hidden />
              </button>
              <button
                className="visibility-btn"
                onClick={(e) => { e.stopPropagation(); onVisibility(char); }}
                onMouseEnter={e => showTooltip(t('character.manageVisibility'), e.currentTarget)}
                onMouseLeave={hideTooltip}
              >
                <VisibilityIcon style={{ fontSize: 14 }} aria-hidden />
              </button>
            </>
          )}
          {(isGM || char.createdBy === userId) && (
            <button
              className="delete-character-btn"
              onClick={(e) => { e.stopPropagation(); onDelete(char); }}
              onMouseEnter={e => showTooltip(t('character.deleteCharacter'), e.currentTarget)}
              onMouseLeave={hideTooltip}
            >
              <CloseIcon style={{ fontSize: 14 }} aria-hidden />
            </button>
          )}
          <button
            className="grid-toggle-btn"
            onClick={(e) => { e.stopPropagation(); onGridToggle(char); }}
            onMouseEnter={e => showTooltip(onGrid ? t('leftPanel.removeFromGrid') : t('leftPanel.addToGrid'), e.currentTarget)}
            onMouseLeave={hideTooltip}
          >
            {onGrid ? <ArrowBackIcon style={{ fontSize: 14 }} aria-hidden /> : <ArrowForwardIcon style={{ fontSize: 14 }} aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CharacterTile;
