import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import StarIcon from '@mui/icons-material/Star';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import Avatar from '../../components/Avatar';
import axiosInstance from '../../api/axios';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import CoCCharacterSheet from './CharacterSheet';
import skillsData from './skills.json';

const COC_ATTRS = [
  { key: 'str', labelKey: 'coc.attr_str' },
  { key: 'con', labelKey: 'coc.attr_con' },
  { key: 'siz', labelKey: 'coc.attr_siz' },
  { key: 'dex', labelKey: 'coc.attr_dex' },
  { key: 'app', labelKey: 'coc.attr_app' },
  { key: 'int', labelKey: 'coc.attr_int' },
  { key: 'pow', labelKey: 'coc.attr_pow' },
  { key: 'edu', labelKey: 'coc.attr_edu' },
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
    if (gameId) return `/games/${gameId}/characters/${charId}`;
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

  const rollWeapon = async (weapon) => {
    if (!gameId || !token) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/rollWeapon`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({
          weaponName: weapon.name,
          weaponSkill: weapon.skillKey,
          damage: weapon.damage,
          modifier: 0,
          characterId: character.id
        })
      });
    } catch (err) {
      console.error('Weapon roll error:', err);
    }
  };

  const rollSkill = async (skillKey) => {
    if (!gameId || !token) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/rollSkill`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ skill: skillKey, modifier: 0, characterId: character.id })
      });
    } catch (err) {
      console.error('Roll error:', err);
    }
  };

  const favoriteWeapons = useMemo(() => {
    const weapons = stats.weapons || [];
    return weapons
      .filter(w => w.isFavourite && w.name)
      .map(w => {
        const skillDef = skillsData.find(s => s.key === w.skillKey);
        const val = (stats.skills || {})[w.skillKey] ?? skillDef?.base ?? 0;
        const skillLabel = skillDef ? t(skillDef.labelKey, { defaultValue: skillDef.label }) : w.skillKey;
        return { name: w.name, skillKey: w.skillKey, damage: w.damage, value: val, skillLabel };
      });
  }, [stats.weapons, stats.skills, t]);

  const favoriteSkills = useMemo(() => {
    const favKeys = stats.favoriteSkills || [];
    if (favKeys.length === 0) return [];
    const customSkills = stats.customSkills || [];
    return favKeys
      .map(key => {
        const def = skillsData.find(s => s.key === key);
        if (def) {
          const val = (stats.skills || {})[key] ?? def.base;
          return { key, label: t(def.labelKey, { defaultValue: def.label }), value: val };
        }
        const custom = customSkills.find(cs => cs.key === key);
        if (custom) {
          const val = (stats.skills || {})[key] ?? custom.base ?? 0;
          return { key, label: custom.name || key, value: val };
        }
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [stats.favoriteSkills, stats.skills, stats.customSkills, t]);

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
        {COC_ATTRS.map(({ key, labelKey }) => {
          const val = stats[key] || 0;
          const label = t(labelKey);
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

      {/* Favorite Weapons */}
      {favoriteWeapons.length > 0 && (
        <div className="favorite-skills">
          <div className="favorite-skills-label"><GpsFixedIcon fontSize="small" style={{ verticalAlign: 'middle', marginRight: 4 }} />{t('coc.weapons')}</div>
          <div className="favorite-skills-grid">
            {favoriteWeapons.map((weapon, idx) => (
              <button
                key={idx}
                className="skill-box skill-box-button"
                onClick={() => rollWeapon(weapon)}
                disabled={!gameId}
                title={weapon.skillLabel}
              >
                <div className="skill-box-label">{weapon.name}</div>
                <div className="skill-box-value">{weapon.value}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Favorite Skills */}
      {favoriteSkills.length > 0 && (
        <div className="favorite-skills">
          <div className="favorite-skills-label"><StarIcon fontSize="small" style={{ verticalAlign: 'middle', marginRight: 4 }} />{t('favoriteSkills')}</div>
          <div className="favorite-skills-grid">
            {favoriteSkills.map(skill => (
              <button
                key={skill.key}
                className="skill-box skill-box-button"
                onClick={() => rollSkill(skill.key)}
                disabled={!gameId}
                title={skill.label}
              >
                <div className="skill-box-label">{skill.label}</div>
                <div className="skill-box-value">{skill.value}</div>
              </button>
            ))}
          </div>
        </div>
      )}

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
