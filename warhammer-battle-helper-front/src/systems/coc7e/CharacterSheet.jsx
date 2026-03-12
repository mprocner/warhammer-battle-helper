import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import CasinoIcon from '@mui/icons-material/Casino';
import StarIcon from '@mui/icons-material/Star';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckIcon from '@mui/icons-material/Check';
import EditIcon from '@mui/icons-material/Edit';
import DraggablePopup from '../../components/common/DraggablePopup';
import AvatarUpload from '../../components/character-sheet/AvatarUpload';
import axiosInstance from '../../api/axios';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import skillsData from './skills.json';

const ATTRIBUTES = [
  { key: 'str', labelKey: 'coc.attr_str' },
  { key: 'con', labelKey: 'coc.attr_con' },
  { key: 'siz', labelKey: 'coc.attr_siz' },
  { key: 'dex', labelKey: 'coc.attr_dex' },
  { key: 'app', labelKey: 'coc.attr_app' },
  { key: 'int', labelKey: 'coc.attr_int' },
  { key: 'pow', labelKey: 'coc.attr_pow' },
  { key: 'edu', labelKey: 'coc.attr_edu' },
  { key: 'mov', labelKey: 'coc.attr_mov', simple: true },
];

function CoCCharacterSheet({ character, onClose, onCharacterUpdate, addLogMessage, gameId, token, isGM = false }) {
  const { t } = useTranslation();
  const stats = character.stats || {};

  const DEFAULT_UNARMED = { name: 'nieuzbrojony', damage: '1K3 + MO', range: '', attacks: 1, ammo: '', malfunction: '', skillKey: 'fighting_brawl' };

  const [edited, setEdited] = useState(() => {
    const s = { ...stats };
    const weps = s.weapons || [];
    const first = weps[0] || {};
    s.weapons = [
      { ...DEFAULT_UNARMED, ...first, name: first.name || DEFAULT_UNARMED.name },
      ...weps.slice(1)
    ];
    return s;
  });
  const [charName, setCharName] = useState(character.name || '');
  const [charAvatar, setCharAvatar] = useState(character.avatar || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editingCustomSkills, setEditingCustomSkills] = useState(() => new Set());
  const [newCustomSkills, setNewCustomSkills] = useState(() => new Set());

  const autoSaveTimer = useRef(null);
  const charNameRef = useRef(character.name || '');
  const charAvatarRef = useRef(character.avatar || '');
  const pendingFocusKey = useRef(null);
  const editingOriginalNames = useRef({});

  const getCharacterSaveUrl = useCallback((charId) => {
    if (gameId) return `/games/${gameId}/characters/${charId}`;
    return `/characters/${charId}`;
  }, [gameId]);

  const saveCharacter = useCallback(async (payload) => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const response = await axiosInstance.put(getCharacterSaveUrl(character.id), payload);
      const updatedStats = response.data?.stats;
      if (updatedStats) {
        setEdited(prev => ({
          ...prev,
          ...(updatedStats.sanityMax !== undefined && { sanityMax: updatedStats.sanityMax, sanity: updatedStats.sanity }),
          ...(updatedStats.damageBonus !== undefined && { damageBonus: updatedStats.damageBonus }),
          ...(updatedStats.build !== undefined && { build: updatedStats.build }),
        }));
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      if (onCharacterUpdate) onCharacterUpdate(payload);
    } catch (err) {
      console.error('Error saving CoC character:', err);
    } finally {
      setIsSaving(false);
    }
  }, [character.id, getCharacterSaveUrl, onCharacterUpdate]);

  const handleSave = useCallback(() => {
    const payload = { ...character, name: charName, avatar: charAvatar, stats: edited };
    saveCharacter(payload);
  }, [character, charName, charAvatar, edited, saveCharacter]);

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      setEdited(prev => {
        const payload = { ...character, name: charNameRef.current, avatar: charAvatarRef.current, stats: prev };
        saveCharacter(payload);
        return prev;
      });
    }, 1000);
  }, [character, saveCharacter]);

  const handleNameChange = useCallback((value) => {
    setCharName(value);
    charNameRef.current = value;
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleAvatarChange = useCallback((url) => {
    setCharAvatar(url);
    charAvatarRef.current = url;
    const payload = { ...character, name: charNameRef.current, avatar: url, stats: edited };
    saveCharacter(payload);
  }, [character, edited, saveCharacter]);

  const setField = useCallback((key, value) => {
    setEdited(prev => ({ ...prev, [key]: value }));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const setSkill = useCallback((skillKey, value) => {
    setEdited(prev => ({
      ...prev,
      skills: { ...(prev.skills || {}), [skillKey]: parseInt(value) || 0 }
    }));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleToggleWeaponFavourite = useCallback((index) => {
    setEdited(prev => {
      const weps = [...(prev.weapons || [])];
      weps[index] = { ...weps[index], isFavourite: !weps[index].isFavourite };
      const newStats = { ...prev, weapons: weps };
      const payload = { ...character, name: charNameRef.current, avatar: charAvatarRef.current, stats: newStats };
      axiosInstance.put(getCharacterSaveUrl(character.id), payload).catch(console.error);
      if (onCharacterUpdate) onCharacterUpdate(payload);
      return newStats;
    });
  }, [character, getCharacterSaveUrl, onCharacterUpdate]);

  // Toggle a skill flag (favoriteSkills or developmentSkills) — immediate save
  const handleToggleSkillFlag = useCallback(async (skillKey, field) => {
    setEdited(prev => {
      const current = prev[field] || [];
      const updated = current.includes(skillKey)
        ? current.filter(k => k !== skillKey)
        : [...current, skillKey];
      const newStats = { ...prev, [field]: updated };
      const payload = { ...character, stats: newStats };
      axiosInstance.put(getCharacterSaveUrl(character.id), payload).catch(console.error);
      if (onCharacterUpdate) onCharacterUpdate(payload);
      return newStats;
    });
  }, [character, getCharacterSaveUrl, onCharacterUpdate]);

  const addCustomSkill = useCallback(() => {
    const key = `custom_${Date.now()}`;
    setEdited(prev => ({
      ...prev,
      customSkills: [...(prev.customSkills || []), { key, name: '', base: 0 }]
    }));
    setEditingCustomSkills(prev => { const next = new Set(prev); next.add(key); return next; });
    setNewCustomSkills(prev => { const next = new Set(prev); next.add(key); return next; });
    pendingFocusKey.current = key;
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const removeCustomSkill = useCallback((key) => {
    setEdited(prev => {
      const skills = { ...(prev.skills || {}) };
      delete skills[key];
      return {
        ...prev,
        customSkills: (prev.customSkills || []).filter(cs => cs.key !== key),
        skills,
      };
    });
    delete editingOriginalNames.current[key];
    setEditingCustomSkills(prev => { const next = new Set(prev); next.delete(key); return next; });
    setNewCustomSkills(prev => { const next = new Set(prev); next.delete(key); return next; });
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const saveCustomSkill = useCallback((key) => {
    delete editingOriginalNames.current[key];
    setEditingCustomSkills(prev => { const next = new Set(prev); next.delete(key); return next; });
    setNewCustomSkills(prev => { const next = new Set(prev); next.delete(key); return next; });
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const editCustomSkill = useCallback((key, currentName) => {
    editingOriginalNames.current[key] = currentName;
    setEditingCustomSkills(prev => { const next = new Set(prev); next.add(key); return next; });
    // nie dodajemy do newCustomSkills — skill ma zostać na swoim miejscu
  }, []);

  const updateCustomSkillName = useCallback((key, name) => {
    setEdited(prev => ({
      ...prev,
      customSkills: (prev.customSkills || []).map(cs => cs.key === key ? { ...cs, name } : cs)
    }));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const updateCustomSkillBase = useCallback((key, base) => {
    setEdited(prev => ({
      ...prev,
      customSkills: (prev.customSkills || []).map(cs => cs.key === key ? { ...cs, base: parseInt(base) || 0 } : cs)
    }));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const rollAttr = useCallback(async (attrKey) => {
    if (!gameId || !token) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/rollSkill`, {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ skill: `attr_${attrKey}`, modifier: 0, characterId: character.id })
      });
    } catch (err) {
      console.error('Roll error:', err);
    }
  }, [gameId, token, character.id]);

  const rollSkill = useCallback(async (skillKey) => {
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
  }, [gameId, token, character.id]);

  const rollWeapon = useCallback(async (weapon) => {
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
  }, [gameId, token, character.id]);

  // Sorted skills from JSON + custom skills. Only brand-new (unsaved) custom skills go last.
  const skills = useMemo(() => {
    const custom = (edited.customSkills || []).map(cs => {
      const editing = editingCustomSkills.has(cs.key);
      const isNew = newCustomSkills.has(cs.key);
      // Podczas edycji istniejącej umiejętności sortujemy po oryginalnej nazwie
      const sortLabel = (editing && !isNew && editingOriginalNames.current[cs.key] != null)
        ? editingOriginalNames.current[cs.key]
        : cs.name || '';
      return { key: cs.key, labelKey: null, label: cs.name || '', sortLabel, base: cs.base || 0, custom: true, editing, isNew };
    });
    return [...skillsData, ...custom].sort((a, b) => {
      if (a.isNew && !b.isNew) return 1;
      if (!a.isNew && b.isNew) return -1;
      const labelA = a.labelKey ? t(a.labelKey, { defaultValue: a.label }) : (a.sortLabel ?? a.label);
      const labelB = b.labelKey ? t(b.labelKey, { defaultValue: b.label }) : (b.sortLabel ?? b.label);
      return labelA.localeCompare(labelB);
    });
  }, [t, edited.customSkills, editingCustomSkills, newCustomSkills]);

  const numAttr = (key) => edited[key] || 0;
  const half = (v) => Math.floor(v / 2);
  const fifth = (v) => Math.floor(v / 5);

  const skillVal = (skill) => {
    const stored = (edited.skills || {})[skill.key];
    if (stored !== undefined) return stored;
    return skill.base;
  };

  const headerButtons = (
    <button
      className="save-btn-sheet"
      onClick={(e) => { e.stopPropagation(); handleSave(); }}
      disabled={isSaving}
      title={saveSuccess ? t('common.saved') : t('common.saveCharacter')}
    >
      {isSaving ? '⏳' : saveSuccess ? '✓' : '💾'}
    </button>
  );

  // Skills split into two columns
  const half1 = Math.ceil(skills.length / 2);
  const skillsLeft = skills.slice(0, half1);
  const skillsRight = skills.slice(half1);

  const renderSkillTable = (list) => (
    <table className="coc-skills-table2">
      <thead>
        <tr>
          <th title={t('coc.development')}><TrendingUpIcon sx={{ fontSize: 14 }} /></th>
          <th style={{ textAlign: 'left' }}>{t('coc.skill')}</th>
          <th>{t('coc.base')}</th>
          <th>{t('coc.value')}</th>
          <th>½</th>
          <th>⅕</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {list.map(skill => {
          const val = skillVal(skill);
          const isFav = (edited.favoriteSkills || []).includes(skill.key);
          const isDev = (edited.developmentSkills || []).includes(skill.key);
          const baseDisplay = skill.baseLabelKey ? t(skill.baseLabelKey) : `${skill.base}%`;
          const skillLabel = skill.custom ? skill.label : t(skill.labelKey, { defaultValue: skill.label });
          const isEditing = skill.editing;
          return (
            <tr key={skill.key}>
              <td>
                <input
                  type="checkbox"
                  checked={isDev}
                  onChange={() => handleToggleSkillFlag(skill.key, 'developmentSkills')}
                />
              </td>
              <td
                className={`coc-skill-name-cell${isEditing ? ' coc-skill-name-cell--custom' : ''}`}
                title={!isEditing ? skillLabel : undefined}
                onClick={() => !isEditing && gameId && rollSkill(skill.key)}
              >
                {isEditing ? (
                  <input
                    type="text"
                    className="coc-custom-skill-name-input"
                    value={skill.label}
                    onChange={e => updateCustomSkillName(skill.key, e.target.value)}
                    onClick={e => e.stopPropagation()}
                    placeholder={t('coc.customSkillNamePlaceholder')}
                    ref={el => {
                      if (el && pendingFocusKey.current === skill.key) {
                        el.focus();
                        pendingFocusKey.current = null;
                      }
                    }}
                  />
                ) : skillLabel}
              </td>
              <td className="coc-derived-cell">
                {isEditing ? (
                  <input
                    type="number"
                    value={skill.base}
                    onChange={e => updateCustomSkillBase(skill.key, e.target.value)}
                    min={0}
                    max={99}
                  />
                ) : baseDisplay}
              </td>
              <td className="coc-skill-value-cell">
                <input
                  type="number"
                  value={val}
                  onChange={e => setSkill(skill.key, e.target.value)}
                  min={0}
                  max={99}
                />
              </td>
              <td className="coc-derived-cell">{half(val)}</td>
              <td className="coc-derived-cell">{fifth(val)}</td>
              <td>
                <div className="coc-custom-skill-actions">
                  <button
                    className={`coc-remove-btn coc-star-btn${isFav ? ' coc-star-btn--active' : ''}`}
                    onClick={() => handleToggleSkillFlag(skill.key, 'favoriteSkills')}
                    title={t('coc.favorite')}
                  >
                    <StarIcon sx={{ fontSize: 14 }} />
                  </button>
                  {skill.custom && (
                    <>
                      {isEditing ? (
                        <button
                          className="coc-remove-btn"
                          onClick={() => saveCustomSkill(skill.key)}
                          title={t('coc.saveCustomSkill')}
                        >
                          <CheckIcon sx={{ fontSize: 16 }} />
                        </button>
                      ) : (
                        <button
                          className="coc-remove-btn"
                          onClick={() => editCustomSkill(skill.key, skill.label)}
                          title={t('coc.editCustomSkill')}
                        >
                          <EditIcon sx={{ fontSize: 16 }} />
                        </button>
                      )}
                      <button
                        className="coc-remove-btn"
                        onClick={() => removeCustomSkill(skill.key)}
                        title={t('coc.removeCustomSkill')}
                      >
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <DraggablePopup
      title={`${character.name || '?'}`}
      onClose={onClose}
      headerButtons={headerButtons}
      initialWidth={900}
    >
      <div className="coc-sheet-layout">
        {/* TOP ROW — Info + Resources | Characteristics */}
        <div className="coc-top-row">
          <div className="coc-col-info">
            {/* Character Info */}
            <div className="coc-section">
              <h4 className="coc-section-title">{t('coc.characterInfo')}</h4>
              <div className="character-info-with-avatar">
                <AvatarUpload
                  currentAvatar={charAvatar}
                  onAvatarChange={handleAvatarChange}
                />
                <div className="coc-info-grid">
                  <label>{t('coc.name')}</label>
                  <input value={charName} onChange={e => handleNameChange(e.target.value)} />
                  <label>{t('coc.occupation')}</label>
                  <input value={edited.occupation || ''} onChange={e => setField('occupation', e.target.value)} />
                  <label>{t('coc.age')}</label>
                  <input type="number" value={edited.age || ''} onChange={e => setField('age', parseInt(e.target.value) || '')} style={{ width: 60 }} />
                  <label>{t('coc.sex')}</label>
                  <input value={edited.sex || ''} onChange={e => setField('sex', e.target.value)} />
                  <label>{t('coc.residence')}</label>
                  <input value={edited.residence || ''} onChange={e => setField('residence', e.target.value)} />
                  <label>{t('coc.birthplace')}</label>
                  <input value={edited.birthplace || ''} onChange={e => setField('birthplace', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Resources */}
            <div className="coc-section">
              <div className="coc-resources-grid">
                <div className="coc-resource-pair coc-resource-pair--featured">
                  <label>{t('coc.hp')}</label>
                  <div className="coc-resource-pair__inputs">
                    <input type="number" value={edited.hp ?? ''} onChange={e => setField('hp', parseInt(e.target.value) || 0)} />
                    <span>/</span>
                    <input type="number" value={edited.hpMax ?? ''} onChange={e => setField('hpMax', parseInt(e.target.value) || 0)} />
                  </div>
                </div>
                <div className="coc-resource-pair coc-resource-pair--featured">
                  <label>{t('coc.mp')}</label>
                  <div className="coc-resource-pair__inputs">
                    <input type="number" value={edited.mp ?? ''} onChange={e => setField('mp', parseInt(e.target.value) || 0)} />
                    <span>/</span>
                    <input type="number" value={edited.mpMax ?? ''} onChange={e => setField('mpMax', parseInt(e.target.value) || 0)} />
                  </div>
                </div>
                <div className="coc-resource-pair coc-resource-pair--featured coc-resource-pair--rollable">
                  <div className="coc-resource-pair__body">
                    <label>{t('coc.sanity')}</label>
                    <div className="coc-resource-pair__inputs">
                      <input type="number" value={edited.sanity ?? ''} onChange={e => setField('sanity', parseInt(e.target.value) || 0)} />
                      <span>/</span>
                      <span className="coc-resource-pair__derived">{edited.sanityMax ?? 99}</span>
                    </div>
                  </div>
                  {gameId && <button className="coc-roll-btn coc-roll-btn--lg" onClick={() => rollAttr('sanity')} title="Roll Sanity"><CasinoIcon fontSize="large" /></button>}
                </div>
                <div className="coc-resource-pair coc-resource-pair--featured coc-resource-pair--rollable">
                  <div className="coc-resource-pair__body">
                    <label>{t('coc.luck')}</label>
                    <div className="coc-resource-pair__inputs">
                      <input type="number" value={edited.luck ?? ''} onChange={e => setField('luck', parseInt(e.target.value) || 0)} />
                    </div>
                  </div>
                  {gameId && <button className="coc-roll-btn coc-roll-btn--lg" onClick={() => rollAttr('luck')} title="Roll Luck"><CasinoIcon fontSize="large" /></button>}
                </div>
                <div className="coc-resource-pair">
                  <label>{t('coc.damageBonus')}</label>
                  <span className="coc-resource-pair__derived">{edited.damageBonus || '0'}</span>
                </div>
                <div className="coc-resource-pair">
                  <label>{t('coc.build')}</label>
                  <span className="coc-resource-pair__derived">{edited.build ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="coc-col-attrs">
            {/* Characteristics & Rolls */}
            <div className="coc-section">
              <h4 className="coc-section-title">{t('coc.attrRolls')}</h4>
              <div className="coc-attrs-grid">
                {ATTRIBUTES.map(({ key, labelKey, simple }) => {
                  const val = numAttr(key);
                  return (
                    <div
                      key={key}
                      className={`coc-attr-card${simple ? ' coc-attr-card--simple' : ''}${gameId ? ' coc-attr-card--clickable' : ''}`}
                      onClick={() => gameId && rollAttr(key)}
                      title={gameId ? `Roll ${t(labelKey)}` : undefined}
                    >
                      <div className="coc-attr-card__name">{t(labelKey)}</div>
                      <input
                        type="number"
                        className="coc-attr-card__input"
                        value={val || ''}
                        onChange={e => setField(key, parseInt(e.target.value) || 0)}
                        onClick={e => e.stopPropagation()}
                        min={0}
                        max={simple ? 99 : 99}
                      />
                      {!simple && (
                        <div className="coc-attr-card__sub">
                          <div className="coc-attr-card__sub-item">
                            <span className="coc-attr-card__sub-label">½</span>
                            <span className="coc-attr-card__sub-val">{half(val) || '—'}</span>
                          </div>
                          <div className="coc-attr-card__sub-item">
                            <span className="coc-attr-card__sub-label">⅕</span>
                            <span className="coc-attr-card__sub-val">{fifth(val) || '—'}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* SKILLS — full width */}
        <div className="coc-section">
          <h4 className="coc-section-title">{t('coc.skills')}</h4>
          <div className="coc-skills-two-col">
            {renderSkillTable(skillsLeft)}
            {renderSkillTable(skillsRight)}
          </div>
          <button className="coc-add-btn" onClick={addCustomSkill}>
            + {t('coc.addCustomSkill')}
          </button>
        </div>

        {/* WEAPONS — full width */}
        <div className="coc-section">
          <h4 className="coc-section-title">{t('coc.weapons')}</h4>
          <table className="coc-weapons-table">
            <thead>
              <tr>
                <th title={t('coc.favorite')}><StarIcon sx={{ fontSize: 14 }} /></th>
                <th>{t('coc.weaponName')}</th>
                <th>{t('coc.weaponDamage')}</th>
                <th>{t('coc.weaponRange')}</th>
                <th className="coc-weapons-table__col--narrow">{t('coc.weaponAttacks')}</th>
                <th className="coc-weapons-table__col--narrow">{t('coc.weaponAmmo')}</th>
                <th className="coc-weapons-table__col--narrow">{t('coc.weaponMalfunction')}</th>
                <th>{t('coc.weaponSkillLabel')}</th>
                <th className="coc-weapons-table__col--actions"></th>
              </tr>
            </thead>
            <tbody>
              {(edited.weapons || []).map((w, i) => {
                const updateWeapon = (field, value) => {
                  setEdited(prev => {
                    const weps = [...(prev.weapons || [])];
                    weps[i] = { ...weps[i], [field]: value };
                    return { ...prev, weapons: weps };
                  });
                  scheduleAutoSave();
                };
                return (
                  <tr key={i}>
                    <td>
                      <input
                        type="checkbox"
                        checked={w.isFavourite || false}
                        onChange={() => handleToggleWeaponFavourite(i)}
                      />
                    </td>
                    <td><input value={w.name || ''} onChange={e => updateWeapon('name', e.target.value)} /></td>
                    <td><input value={w.damage || ''} onChange={e => updateWeapon('damage', e.target.value)} /></td>
                    <td><input value={w.range || ''} onChange={e => updateWeapon('range', e.target.value)} /></td>
                    <td><input type="number" value={w.attacks ?? ''} onChange={e => updateWeapon('attacks', parseInt(e.target.value) || 0)} min={0} /></td>
                    <td><input type="number" value={w.ammo ?? ''} onChange={e => updateWeapon('ammo', parseInt(e.target.value) || 0)} min={0} /></td>
                    <td><input type="number" value={w.malfunction ?? ''} onChange={e => updateWeapon('malfunction', parseInt(e.target.value) || 0)} min={0} /></td>
                    <td>
                      <select
                        className="coc-weapon-skill-select"
                        value={w.skillKey || 'fighting_brawl'}
                        onChange={e => updateWeapon('skillKey', e.target.value)}
                      >
                        <option value="fighting_brawl">{t('coc.skill_fighting_brawl')}</option>
                        <option value="firearms_handgun">{t('coc.skill_firearms_handgun')}</option>
                        <option value="firearms_rifle">{t('coc.skill_firearms_rifle')}</option>
                      </select>
                    </td>
                    <td className="coc-weapons-table__actions">
                      {gameId && (
                        <button className="coc-roll-btn" onClick={() => rollWeapon(w)} title={t('coc.rollWeapon')}>
                          <CasinoIcon fontSize="small" />
                        </button>
                      )}
                      {i !== 0 && (
                        <button
                          className="coc-remove-btn"
                          onClick={() => {
                            setEdited(prev => ({ ...prev, weapons: prev.weapons.filter((_, wi) => wi !== i) }));
                            scheduleAutoSave();
                          }}
                        >✕</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button
            className="coc-add-btn"
            onClick={() => {
              setEdited(prev => ({
                ...prev,
                weapons: [...(prev.weapons || []), { name: '', damage: '', range: '', attacks: '', ammo: '', malfunction: '', skillKey: 'fighting_brawl' }]
              }));
              scheduleAutoSave();
            }}
          >+ {t('coc.addWeapon')}</button>
        </div>

        {/* EQUIPMENT & CASH — full width, 2 equal panels */}
        <div className="coc-section">
          <div className="coc-equip-row">
            <div className="coc-equip-panel">
              <h4 className="coc-section-title">{t('coc.equipmentSection')}</h4>
              <textarea
                className="coc-equip-textarea"
                value={edited.equipment || ''}
                onChange={e => setField('equipment', e.target.value)}
              />
            </div>
            <div className="coc-equip-panel">
              <h4 className="coc-section-title">{t('coc.cashAndPossessions')}</h4>
              <div className="coc-equip-inputs">
                <div className="coc-equip-input-row">
                  <label>{t('coc.spendingLevel')}</label>
                  <input value={edited.spendingLevel || ''} onChange={e => setField('spendingLevel', e.target.value)} />
                </div>
                <div className="coc-equip-input-row">
                  <label>{t('coc.cash')}</label>
                  <input value={edited.cash || ''} onChange={e => setField('cash', e.target.value)} />
                </div>
              </div>
              <label className="coc-bg-label">{t('coc.assets')}</label>
              <textarea
                className="coc-equip-textarea"
                value={edited.assets || ''}
                onChange={e => setField('assets', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* BACKGROUND — full width, 2 columns */}
        <div className="coc-section">
          <h4 className="coc-section-title">{t('coc.background')}</h4>
          <div className="coc-bg-grid">
            {[
              ['personalDescription', t('coc.personalDescription')],
              ['ideology', t('coc.ideology')],
              ['significantPeople', t('coc.significantPeople')],
              ['meaningfulLocations', t('coc.meaningfulLocations')],
              ['possessions', t('coc.treasuredPossessions')],
              ['traits', t('coc.traits')],
              ['injuriesScars', t('coc.injuries')],
              ['phobiasManias', t('coc.phobiasManias')],
              ['arcaneTomes', t('coc.arcaneTomesSpells')],
              ['encountersWithEntities', t('coc.encountersWithEntities')],
            ].map(([key, label]) => (
              <div key={key} className="coc-bg-field">
                <label className="coc-bg-label">{label}</label>
                <textarea
                  className="coc-bg-textarea"
                  value={edited[key] || ''}
                  onChange={e => setField(key, e.target.value)}
                  rows={3}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </DraggablePopup>
  );
}

export default CoCCharacterSheet;
