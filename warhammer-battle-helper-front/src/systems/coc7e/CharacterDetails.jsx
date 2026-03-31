import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import StarIcon from '@mui/icons-material/Star';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import CasinoIcon from '@mui/icons-material/Casino';
import CharacterHeader from '../shared/CharacterHeader';
import axiosInstance from '../../api/axios';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import CoCCharacterSheet from './CharacterSheet';
import CoCDiceModOverlay from './CoCDiceModOverlay';
import skillsData from './skills.json';
import { getCharacterSaveUrl } from '../shared/characterApi';

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
  rollVisibility = 'all',
}) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);

  const stats = character?.stats || {};

  const handleSanityChange = async (newValue) => {
    const updated = {
      ...character,
      stats: { ...stats, sanity: Math.max(0, Math.min(stats.sanityMax || 99, Number(newValue) || 0)) }
    };
    onCharacterUpdate(updated);
    try {
      await axiosInstance.put(getCharacterSaveUrl(updated.id, gameId), updated);
    } catch (err) {
      console.error('Error saving sanity:', err);
    }
  };

  const handleHpChange = async (newValue) => {
    const updated = {
      ...character,
      stats: { ...stats, hp: Math.max(0, Math.min(stats.hpMax || 0, Number(newValue) || 0)) }
    };
    onCharacterUpdate(updated);
    try {
      await axiosInstance.put(getCharacterSaveUrl(updated.id, gameId), updated);
    } catch (err) {
      console.error('Error saving HP:', err);
    }
  };

  const handleLuckChange = async (newValue) => {
    const updated = {
      ...character,
      stats: { ...stats, luck: Math.max(0, Math.min(99, Number(newValue) || 0)) }
    };
    onCharacterUpdate(updated);
    try {
      await axiosInstance.put(getCharacterSaveUrl(updated.id, gameId), updated);
    } catch (err) {
      console.error('Error saving luck:', err);
    }
  };

  const handleMpChange = async (newValue) => {
    const updated = {
      ...character,
      stats: { ...stats, mp: Math.max(0, Math.min(stats.mpMax || 0, Number(newValue) || 0)) }
    };
    onCharacterUpdate(updated);
    try {
      await axiosInstance.put(getCharacterSaveUrl(updated.id, gameId), updated);
    } catch (err) {
      console.error('Error saving MP:', err);
    }
  };

  const rollAttr = async (attrKey, attrVal, diceMod = 0) => {
    if (!gameId || !token || !attrVal) return;
    const skillKey = `attr_${attrKey}`;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/rollSkill`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ skill: skillKey, modifier: 0, diceMod, characterId: character.id, visibility: rollVisibility })
      });
    } catch (err) {
      console.error('Roll error:', err);
      if (addLogMessage) addLogMessage(t('combat.rollFailed'), 'error');
    }
  };

  const rollWeapon = async (weapon, diceMod = 0) => {
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
          diceMod,
          characterId: character.id,
          visibility: rollVisibility
        })
      });
    } catch (err) {
      console.error('Weapon roll error:', err);
    }
  };

  const rollSkill = async (skillKey, diceMod = 0) => {
    if (!gameId || !token) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/rollSkill`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ skill: skillKey, modifier: 0, diceMod, characterId: character.id, visibility: rollVisibility })
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
      <CharacterHeader
        avatarSrc={character.avatar}
        characterId={character.id}
        name={character.name}
        onOpenSheet={() => setShowDetails(true)}
        t={t}
      />

      {/* HP / Sanity / Luck quick view */}
      <div className="detail-grid">
        <div className="detail-item">
          <div className="detail-label">{t('coc.luck')}</div>
          <div className="detail-value modifier-value">
            <div className="coc-detail-left">
              <input
                type="number"
                className="wounds-input"
                min={0}
                max={99}
                value={stats.luck ?? 0}
                onChange={e => handleLuckChange(e.target.value)}
              />
            </div>
            {gameId && (
              <CoCDiceModOverlay onDiceModRoll={(d) => rollAttr('luck', stats.luck, d)} disabled={!gameId}>
                <button className="coc-roll-btn" title={`Roll ${t('coc.luck')}`}>
                  <CasinoIcon fontSize="small" />
                </button>
              </CoCDiceModOverlay>
            )}
          </div>
        </div>
        <div className="detail-item">
          <div className="detail-label">{t('coc.sanity')}</div>
          <div className="detail-value modifier-value">
            <div className="coc-detail-left">
              <input
                type="number"
                className="wounds-input"
                min={0}
                max={stats.sanityMax || 99}
                value={stats.sanity ?? stats.sanityMax ?? 0}
                onChange={e => handleSanityChange(e.target.value)}
              />
              <span>/ {stats.sanityMax || '—'}</span>
            </div>
            {gameId && (
              <CoCDiceModOverlay onDiceModRoll={(d) => rollAttr('sanity', stats.sanity, d)} disabled={!gameId}>
                <button className="coc-roll-btn" title={`Roll ${t('coc.sanity')}`}>
                  <CasinoIcon fontSize="small" />
                </button>
              </CoCDiceModOverlay>
            )}
          </div>
        </div>
        <div className="detail-item">
          <div className="detail-label">{t('coc.hp_short')}</div>
          <div className="detail-value modifier-value">
            <div className="coc-detail-left">
              <input
                type="number"
                className="wounds-input"
                min={0}
                max={stats.hpMax || 0}
                value={stats.hp ?? 0}
                onChange={e => handleHpChange(e.target.value)}
              />
              <span>/ {stats.hpMax || '—'}</span>
            </div>
          </div>
        </div>
        <div className="detail-item">
          <div className="detail-label">{t('coc.mp_short')}</div>
          <div className="detail-value modifier-value">
            <div className="coc-detail-left">
              <input
                type="number"
                className="wounds-input"
                min={0}
                max={stats.mpMax || 0}
                value={stats.mp ?? 0}
                onChange={e => handleMpChange(e.target.value)}
              />
              <span>/ {stats.mpMax || '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Attribute mini grid */}
      <div className="characteristics-mini">
        {COC_ATTRS.map(({ key, labelKey }) => {
          const val = stats[key] || 0;
          const label = t(labelKey);
          return (
            <CoCDiceModOverlay key={key} onDiceModRoll={(d) => rollAttr(key, val, d)} disabled={!val || !gameId}>
              <button
                className="char-box char-box-button"
                disabled={!val}
                title={`Roll ${label}`}
              >
                <div className="char-box-label">{label}</div>
                <div className="char-box-value">{val || '—'}</div>
              </button>
            </CoCDiceModOverlay>
          );
        })}
      </div>

      {/* Favorite Weapons */}
      {favoriteWeapons.length > 0 && (
        <div className="favorite-skills">
          <div className="favorite-skills-label"><GpsFixedIcon fontSize="small" style={{ verticalAlign: 'middle', marginRight: 4 }} />{t('coc.weapons')}</div>
          <div className="favorite-skills-grid">
            {favoriteWeapons.map((weapon, idx) => (
              <CoCDiceModOverlay key={idx} onDiceModRoll={(d) => rollWeapon(weapon, d)} disabled={!gameId}>
                <button
                  className="skill-box skill-box-button"
                  disabled={!gameId}
                  title={weapon.skillLabel}
                >
                  <div className="skill-box-label">{weapon.name}</div>
                  <div className="skill-box-value">{weapon.value}</div>
                </button>
              </CoCDiceModOverlay>
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
              <CoCDiceModOverlay key={skill.key} onDiceModRoll={(d) => rollSkill(skill.key, d)} disabled={!gameId}>
                <button
                  className="skill-box skill-box-button"
                  disabled={!gameId}
                  title={skill.label}
                >
                  <div className="skill-box-label">{skill.label}</div>
                  <div className="skill-box-value">{skill.value}</div>
                </button>
              </CoCDiceModOverlay>
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
          rollVisibility={rollVisibility}
        />
      )}
    </div>
  );
}

export default CoCCharacterDetails;
