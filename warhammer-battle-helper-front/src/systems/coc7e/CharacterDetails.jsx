import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Avatar from '../../components/Avatar';
import CharacterStates from '../../components/CharacterStates';
import axiosInstance from '../../api/axios';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import CoCCharacterSheet from './CharacterSheet';

const COC_ATTRS = [
  { key: 'str', label: 'STR' },
  { key: 'con', label: 'CON' },
  { key: 'siz', label: 'SIZ' },
  { key: 'dex', label: 'DEX' },
  { key: 'app', label: 'APP' },
  { key: 'int', label: 'INT' },
  { key: 'pow', label: 'POW' },
  { key: 'edu', label: 'EDU' },
];

function CoCCharacterDetails({
  character,
  onCharacterUpdate,
  addLogMessage,
  gameId = null,
  token = null,
  isGM = false,
  autoOpenSheet = false,
  onSheetOpened = null,
}) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);

  const stats = character?.stats || {};

  const getCharacterSaveUrl = (charId) => {
    if (isGM && gameId) return `/games/${gameId}/characters/${charId}`;
    return `/characters/${charId}`;
  };

  const handleSanityChange = async (newValue) => {
    const updated = {
      ...character,
      stats: { ...stats, sanity: Math.max(0, Math.min(stats.sanityMax || 99, Number(newValue) || 0)) }
    };
    onCharacterUpdate(updated);
    try {
      await axiosInstance.put(getCharacterSaveUrl(updated.id), updated);
    } catch (err) {
      console.error('Error saving sanity:', err);
    }
  };

  const handleHpChange = async (newValue) => {
    const updated = {
      ...character,
      stats: { ...stats, hp: Math.max(0, Math.min(stats.hpMax || 20, Number(newValue) || 0)) }
    };
    onCharacterUpdate(updated);
    try {
      await axiosInstance.put(getCharacterSaveUrl(updated.id), updated);
    } catch (err) {
      console.error('Error saving HP:', err);
    }
  };

  const rollAttr = async (attrKey, attrVal) => {
    if (!gameId || !token || !attrVal) return;
    // For CoC, attribute test = roll d100 vs attrVal*5 (basic roll)
    const skillKey = `attr_${attrKey}`;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/rollSkill`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ skill: skillKey, modifier: 0, characterId: character.id })
      });
    } catch (err) {
      console.error('Roll error:', err);
      if (addLogMessage) addLogMessage(t('combat.rollFailed'), 'error');
    }
  };

  if (!character) {
    return (
      <div className="character-details empty">
        <h2>{t('character.selectCharacter')}</h2>
        <p className="empty-hint">{t('character.selectCharacterHint')}</p>
      </div>
    );
  }

  return (
    <div className="character-details coc-details">
      <div className="character-details-header">
        <Avatar key={`${character.id}-${character.avatar || 'default'}`} src={character.avatar} />
        <h2>{character.name || 'Unknown'}</h2>
        <button className="character-sheet-btn" onClick={() => setShowDetails(true)}>
          📜
          <span className="state-tooltip">
            <span className="state-tooltip-arrow" />
            {t('character.characterCard')}
          </span>
        </button>
      </div>

      <CharacterStates
        character={character}
        onCharacterUpdate={onCharacterUpdate}
        saveUrl={getCharacterSaveUrl(character.id)}
      />

      {/* HP / Sanity / Luck quick view */}
      <div className="detail-grid">
        <div className="detail-item">
          <div className="detail-label">{t('coc.hp')}</div>
          <div className="detail-value modifier-value">
            <input
              type="number"
              className="wounds-input"
              min={0}
              max={stats.hpMax || 20}
              value={stats.hp ?? stats.hpMax ?? 0}
              onChange={e => handleHpChange(e.target.value)}
            />
            &nbsp;/ {stats.hpMax || '—'}
          </div>
        </div>
        <div className="detail-item">
          <div className="detail-label">{t('coc.sanity')}</div>
          <div className="detail-value modifier-value">
            <input
              type="number"
              className="wounds-input"
              min={0}
              max={stats.sanityMax || 99}
              value={stats.sanity ?? stats.sanityMax ?? 0}
              onChange={e => handleSanityChange(e.target.value)}
            />
            &nbsp;/ {stats.sanityMax || '—'}
          </div>
        </div>
        <div className="detail-item">
          <div className="detail-label">{t('coc.luck')}</div>
          <div className="detail-value">{stats.luck ?? '—'}</div>
        </div>
        <div className="detail-item">
          <div className="detail-label">{t('coc.mp')}</div>
          <div className="detail-value">{stats.mp ?? '—'} / {stats.mpMax ?? '—'}</div>
        </div>
      </div>

      {/* Attribute mini grid */}
      <div className="characteristics-mini">
        {COC_ATTRS.map(({ key, label }) => {
          const val = stats[key] || 0;
          return (
            <button
              key={key}
              className="char-box char-box-button"
              onClick={() => rollAttr(key, val)}
              disabled={!val}
              title={`Roll ${label}`}
            >
              <div className="char-box-label">{label}</div>
              <div className="char-box-value">{val || '—'}</div>
            </button>
          );
        })}
      </div>

      {showDetails && (
        <CoCCharacterSheet
          character={character}
          onClose={() => setShowDetails(false)}
          onCharacterUpdate={onCharacterUpdate}
          addLogMessage={addLogMessage}
          gameId={gameId}
          token={token}
          isGM={isGM}
        />
      )}
    </div>
  );
}

export default CoCCharacterDetails;
