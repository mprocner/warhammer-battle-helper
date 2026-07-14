import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import StarIcon from '@mui/icons-material/Star';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';
import CharacterHeader from '../shared/CharacterHeader';
import CharacterStates from '../../components/CharacterStates';
import axiosInstance from '../../api/axios';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { getCharacterSaveUrl } from '../shared/characterApi';
import DnD5eAdvantageOverlay from './DnD5eAdvantageOverlay';
import skillsData from './skills.json';

const ABILITIES = [
  { key: 'str', labelKey: 'dnd.str' },
  { key: 'dex', labelKey: 'dnd.dex' },
  { key: 'con', labelKey: 'dnd.con' },
  { key: 'int', labelKey: 'dnd.int' },
  { key: 'wis', labelKey: 'dnd.wis' },
  { key: 'cha', labelKey: 'dnd.cha' },
];

function abilityMod(score) {
  const diff = score - 10;
  return diff >= 0 ? Math.floor(diff / 2) : Math.ceil(diff / 2);
}

function formatMod(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function DnD5eCharacterDetails({
  character,
  onCharacterUpdate,
  addLogMessage,
  gameId = null,
  token = null,
  isGM = false,
  onOpenCharacterSheet = null,
  rollVisibility = 'all',
}) {
  const { t } = useTranslation();

  const stats    = character?.stats || {};
  const resources = stats.resources  || {};
  const abilities = stats.abilities  || {};
  const derived   = stats.derived    || {};

  const handleHpChange = async (newValue) => {
    const updated = {
      ...character,
      stats: { ...stats, resources: { ...resources, hp: Math.max(0, Math.min(resources.hpMax || 0, Number(newValue) || 0)) } },
    };
    onCharacterUpdate(updated);
    try { await axiosInstance.put(getCharacterSaveUrl(updated.id, gameId), updated); }
    catch (err) { console.error('Error saving HP:', err); }
  };

  const rollAbility = async (abilityKey, diceMod = 0, target = 0) => {
    if (!gameId || !token) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/rollSkill`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ skill: `ability_${abilityKey}`, modifier: 0, diceMod, target, characterId: character.id, visibility: rollVisibility })
      });
    } catch (err) { console.error('Roll error:', err); }
  };

  const rollWeapon = async (weapon, diceMod = 0) => {
    if (!gameId || !token) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/rollWeapon`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({
          weaponName: weapon.name,
          weaponSkill: weapon.attackAbility || 'str',
          damage: weapon.damage,
          modifier: 0,
          diceMod,
          characterId: character.id,
          visibility: rollVisibility
        })
      });
    } catch (err) { console.error('Weapon roll error:', err); }
  };

  const rollSkill = async (skillKey, diceMod = 0, target = 0) => {
    if (!gameId || !token) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/rollSkill`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ skill: `skill_${skillKey}`, modifier: 0, diceMod, target, characterId: character.id, visibility: rollVisibility })
      });
    } catch (err) { console.error('Roll error:', err); }
  };

  const favoriteWeapons = useMemo(() => {
    return (stats.weapons || []).filter(w => w.isFavourite && w.name);
  }, [stats.weapons]);

  const favoriteSpells = useMemo(() => {
    return (stats.spells || []).filter(s => s.isFavourite && s.name);
  }, [stats.spells]);

  const rollSpell = async (spell, diceMod = 0) => {
    if (!gameId || !token) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/rollWeapon`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({
          weaponName: spell.name,
          weaponSkill: 'spellcasting',
          damage: spell.damage || '',
          modifier: 0,
          diceMod,
          characterId: character.id,
          visibility: rollVisibility
        })
      });
    } catch (err) { console.error('Spell roll error:', err); }
  };

  const favoriteSkills = useMemo(() => {
    const favKeys = stats.favoriteSkills || [];
    if (!favKeys.length) return [];
    const skillTotals = derived.skills || {};
    return favKeys.map(key => {
      const def = skillsData.find(s => s.key === key);
      if (!def) return null;
      return { key, value: skillTotals[key] ?? 0 };
    }).filter(Boolean);
  }, [stats.favoriteSkills, derived.skills]);

  if (!character) {
    return (
      <div className="character-details empty">
        <h2>{t('character.selectCharacter')}</h2>
        <p className="empty-hint">{t('character.selectCharacterHint')}</p>
      </div>
    );
  }

  return (
    <div className="character-details dnd-details">
      <CharacterHeader
        avatarSrc={character.avatar}
        characterId={character.id}
        name={character.name}
        onOpenSheet={() => onOpenCharacterSheet?.(character.id)}
        t={t}
      />

      <CharacterStates
        character={character}
        onCharacterUpdate={onCharacterUpdate}
        saveUrl={getCharacterSaveUrl(character.id, gameId)}
      />

      {/* Quick combat stats */}
      <div className="detail-grid">
        <div className="detail-item detail-item--primary dnd-hp-box">
          <div className="detail-label">{t('dnd.hp')}</div>
          <div className="dnd-hp-box__row">
            <button className="dnd-hp-adjust-btn" onClick={() => handleHpChange(Math.max(0, (resources.hp ?? 0) - 1))}>
              <RemoveIcon style={{ fontSize: 16 }} />
            </button>
            <div className="dnd-hp-box__value">
              <input
                type="number"
                className="dnd-hp-box__input"
                min={0}
                max={resources.hpMax || 0}
                value={resources.hp ?? 0}
                onChange={e => handleHpChange(e.target.value)}
              />
              <span className="dnd-hp-box__sep">/</span>
              <span className="dnd-hp-box__max">{resources.hpMax || '—'}</span>
            </div>
            <button className="dnd-hp-adjust-btn" onClick={() => handleHpChange(Math.min(resources.hpMax || 0, (resources.hp ?? 0) + 1))}>
              <AddIcon style={{ fontSize: 16 }} />
            </button>
          </div>
        </div>
        <div className="detail-item detail-item--primary">
          <div className="detail-label">{t('dnd.armorClass')}</div>
          <div className="detail-value">
            <strong>{stats.armorClass ?? 10}</strong>
          </div>
        </div>
        <div className="detail-item">
          <div className="detail-label">{t('dnd.initiative')}</div>
          <div className="detail-value">
            <strong>{formatMod(derived.initiative ?? 0)}</strong>
          </div>
        </div>
        <div className="detail-item">
          <div className="detail-label">{t('dnd.passivePerception')}</div>
          <div className="detail-value">
            <strong>{derived.passivePerception ?? 10}</strong>
          </div>
        </div>
      </div>

      {/* Ability score mini-grid */}
      <div className="dnd-ability-grid">
        {ABILITIES.map(({ key, labelKey }) => {
          const score = abilities[key] ?? 10;
          const mod = abilityMod(score);
          return (
            <DnD5eAdvantageOverlay key={key} onAdvRoll={(d, t) => rollAbility(key, d, t)} disabled={!gameId} showDC>
              <button className="dnd-ability-box" title={`Roll ${t(labelKey)} check`}>
                <div className="dnd-ability-box__label">{t(labelKey)}</div>
                <div className="dnd-ability-box__mod">{formatMod(mod)}</div>
                <div className="dnd-ability-box__score">{score}</div>
              </button>
            </DnD5eAdvantageOverlay>
          );
        })}
      </div>

      {/* Favorite Weapons */}
      {favoriteWeapons.length > 0 && (
        <div className="favorite-skills">
          <div className="favorite-skills-label">
            <GpsFixedIcon fontSize="small" style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {t('dnd.weapons')}
          </div>
          <div className="favorite-skills-grid">
            {favoriteWeapons.map((weapon, idx) => (
              <DnD5eAdvantageOverlay key={idx} onAdvRoll={(d) => rollWeapon(weapon, d)} disabled={!gameId}>
                <button className="skill-box skill-box-button" disabled={!gameId}>
                  <div className="skill-box-label">{weapon.name}</div>
                  <div className="skill-box-value">{weapon.damage}</div>
                </button>
              </DnD5eAdvantageOverlay>
            ))}
          </div>
        </div>
      )}

      {/* Favorite Skills */}
      {favoriteSkills.length > 0 && (
        <div className="favorite-skills">
          <div className="favorite-skills-label">
            <StarIcon fontSize="small" style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {t('favoriteSkills')}
          </div>
          <div className="favorite-skills-grid">
            {favoriteSkills.map(skill => (
              <DnD5eAdvantageOverlay key={skill.key} onAdvRoll={(d, t) => rollSkill(skill.key, d, t)} disabled={!gameId} showDC>
                <button className="skill-box skill-box-button" disabled={!gameId}>
                  <div className="skill-box-label">{t('dnd.skill_' + skill.key)}</div>
                  <div className="skill-box-value">{formatMod(skill.value)}</div>
                </button>
              </DnD5eAdvantageOverlay>
            ))}
          </div>
        </div>
      )}

      {/* Favorite Spells */}
      {favoriteSpells.length > 0 && (
        <div className="favorite-skills">
          <div className="favorite-skills-label">
            <AutoFixHighIcon fontSize="small" style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {t('dnd.spells')}
          </div>
          <div className="favorite-skills-grid">
            {favoriteSpells.map((spell, idx) => (
              <DnD5eAdvantageOverlay key={idx} onAdvRoll={(d) => rollSpell(spell, d)} disabled={!gameId}>
                <button className="skill-box skill-box-button" disabled={!gameId}>
                  <div className="skill-box-label">{spell.name}</div>
                  <div className="skill-box-value">{spell.damage || `L${spell.level ?? 0}`}</div>
                </button>
              </DnD5eAdvantageOverlay>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

export default DnD5eCharacterDetails;
