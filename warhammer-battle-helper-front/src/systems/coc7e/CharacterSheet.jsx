import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import DraggablePopup from '../../components/common/DraggablePopup';
import axiosInstance from '../../api/axios';
import { getApiUrl, getApiHeaders } from '../../api/axios';

// CoC 7e core attributes displayed on the sheet
const ATTRIBUTES = [
  { key: 'str', label: 'STR' },
  { key: 'con', label: 'CON' },
  { key: 'siz', label: 'SIZ' },
  { key: 'dex', label: 'DEX' },
  { key: 'app', label: 'APP' },
  { key: 'int', label: 'INT' },
  { key: 'pow', label: 'POW' },
  { key: 'edu', label: 'EDU' },
];

// Default CoC skill list with base percentages
const DEFAULT_SKILLS = [
  { key: 'accounting',       label: 'Accounting',        base: 5 },
  { key: 'anthropology',     label: 'Anthropology',      base: 1 },
  { key: 'appraise',         label: 'Appraise',          base: 5 },
  { key: 'archaeology',      label: 'Archaeology',       base: 1 },
  { key: 'charm',            label: 'Charm',             base: 15 },
  { key: 'climb',            label: 'Climb',             base: 20 },
  { key: 'credit_rating',    label: 'Credit Rating',     base: 0 },
  { key: 'cthulhu_mythos',   label: 'Cthulhu Mythos',    base: 0 },
  { key: 'disguise',         label: 'Disguise',          base: 5 },
  { key: 'dodge',            label: 'Dodge',             base: 0 }, // DEX/2
  { key: 'drive_auto',       label: 'Drive Auto',        base: 20 },
  { key: 'elec_repair',      label: 'Elec. Repair',      base: 10 },
  { key: 'fast_talk',        label: 'Fast Talk',         base: 5 },
  { key: 'fighting_brawl',   label: 'Fighting (Brawl)',  base: 25 },
  { key: 'firearms_handgun', label: 'Firearms (Handgun)', base: 20 },
  { key: 'firearms_rifle',   label: 'Firearms (Rifle)',  base: 25 },
  { key: 'first_aid',        label: 'First Aid',         base: 30 },
  { key: 'history',          label: 'History',           base: 5 },
  { key: 'intimidate',       label: 'Intimidate',        base: 15 },
  { key: 'jump',             label: 'Jump',              base: 20 },
  { key: 'language_own',     label: 'Language (Own)',    base: 0 }, // EDU*5
  { key: 'law',              label: 'Law',               base: 5 },
  { key: 'library_use',      label: 'Library Use',       base: 20 },
  { key: 'listen',           label: 'Listen',            base: 20 },
  { key: 'locksmith',        label: 'Locksmith',         base: 1 },
  { key: 'mech_repair',      label: 'Mech. Repair',      base: 10 },
  { key: 'medicine',         label: 'Medicine',          base: 1 },
  { key: 'natural_world',    label: 'Natural World',     base: 10 },
  { key: 'navigate',         label: 'Navigate',          base: 10 },
  { key: 'occult',           label: 'Occult',            base: 5 },
  { key: 'op_heavy_mach',    label: 'Op. Heavy Mach.',   base: 1 },
  { key: 'persuade',         label: 'Persuade',          base: 10 },
  { key: 'pilot',            label: 'Pilot',             base: 1 },
  { key: 'psychology',       label: 'Psychology',        base: 10 },
  { key: 'psychoanalysis',   label: 'Psychoanalysis',    base: 1 },
  { key: 'ride',             label: 'Ride',              base: 5 },
  { key: 'science',          label: 'Science',           base: 1 },
  { key: 'sleight_of_hand',  label: 'Sleight of Hand',   base: 10 },
  { key: 'spot_hidden',      label: 'Spot Hidden',       base: 25 },
  { key: 'stealth',          label: 'Stealth',           base: 20 },
  { key: 'survival',         label: 'Survival',          base: 10 },
  { key: 'swim',             label: 'Swim',              base: 20 },
  { key: 'throw',            label: 'Throw',             base: 20 },
  { key: 'track',            label: 'Track',             base: 10 },
];

function CoCCharacterSheet({ character, onClose, onCharacterUpdate, addLogMessage, gameId, token, isGM = false }) {
  const { t } = useTranslation();
  const stats = character.stats || {};

  const [edited, setEdited] = useState({ ...stats });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState('main'); // 'main' | 'skills' | 'background'

  const getCharacterSaveUrl = useCallback((charId) => {
    if (isGM && gameId) return `/games/${gameId}/characters/${charId}`;
    return `/characters/${charId}`;
  }, [isGM, gameId]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const payload = { ...character, stats: edited };
      await axiosInstance.put(getCharacterSaveUrl(character.id), payload);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      if (onCharacterUpdate) onCharacterUpdate({ ...character, stats: edited });
    } catch (err) {
      console.error('Error saving CoC character:', err);
    } finally {
      setIsSaving(false);
    }
  }, [character, edited, getCharacterSaveUrl, onCharacterUpdate]);

  const setField = useCallback((key, value) => {
    setEdited(prev => ({ ...prev, [key]: value }));
  }, []);

  const setSkill = useCallback((skillKey, value) => {
    setEdited(prev => ({
      ...prev,
      skills: { ...(prev.skills || {}), [skillKey]: parseInt(value) || 0 }
    }));
  }, []);

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

  const skills = edited.skills || {};

  const numAttr = (key) => edited[key] || 0;
  const half = (v) => Math.floor(v / 2);
  const fifth = (v) => Math.floor(v / 5);

  return (
    <DraggablePopup
      title={`${character.name || '?'} — Call of Cthulhu 7e`}
      onClose={onClose}
      headerButtons={headerButtons}
    >
      {/* Tab bar */}
      <div className="coc-tab-bar">
        {['main', 'skills', 'background'].map(tab => (
          <button
            key={tab}
            className={`coc-tab-btn${activeTab === tab ? ' coc-tab-btn--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'main' ? t('coc.tabMain') : tab === 'skills' ? t('coc.tabSkills') : t('coc.tabBackground')}
          </button>
        ))}
      </div>

      {activeTab === 'main' && (
        <div className="coc-main-tab">
          {/* Investigator info */}
          <div className="coc-info-row">
            <label>{t('coc.occupation')}</label>
            <input value={edited.occupation || ''} onChange={e => setField('occupation', e.target.value)} />
            <label>{t('coc.age')}</label>
            <input type="number" value={edited.age || ''} onChange={e => setField('age', parseInt(e.target.value) || '')} style={{ width: 60 }} />
          </div>

          {/* 8 Attributes table */}
          <table className="coc-attrs-table">
            <thead>
              <tr>
                <th>{t('coc.attr')}</th>
                <th>{t('coc.regular')}</th>
                <th>{t('coc.hard')}</th>
                <th>{t('coc.extreme')}</th>
              </tr>
            </thead>
            <tbody>
              {ATTRIBUTES.map(({ key, label }) => {
                const val = numAttr(key);
                return (
                  <tr key={key}>
                    <td className="coc-attr-label">{label}</td>
                    <td>
                      <input
                        type="number"
                        className="coc-attr-input"
                        value={val || ''}
                        onChange={e => setField(key, parseInt(e.target.value) || 0)}
                        min={0}
                        max={99}
                      />
                    </td>
                    <td className="coc-derived">{half(val) || '—'}</td>
                    <td className="coc-derived">{fifth(val) || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Derived / tracked values */}
          <div className="coc-derived-section">
            <div className="coc-resource-row">
              <div className="coc-resource">
                <label>{t('coc.hp')}</label>
                <input type="number" value={edited.hp ?? ''} onChange={e => setField('hp', parseInt(e.target.value) || 0)} className="coc-resource-input" />
                <span>/ </span>
                <input type="number" value={edited.hpMax ?? ''} onChange={e => setField('hpMax', parseInt(e.target.value) || 0)} className="coc-resource-input" placeholder="Max" />
              </div>
              <div className="coc-resource">
                <label>{t('coc.mp')}</label>
                <input type="number" value={edited.mp ?? ''} onChange={e => setField('mp', parseInt(e.target.value) || 0)} className="coc-resource-input" />
                <span>/ </span>
                <input type="number" value={edited.mpMax ?? ''} onChange={e => setField('mpMax', parseInt(e.target.value) || 0)} className="coc-resource-input" placeholder="Max" />
              </div>
              <div className="coc-resource">
                <label>{t('coc.sanity')}</label>
                <input type="number" value={edited.sanity ?? ''} onChange={e => setField('sanity', parseInt(e.target.value) || 0)} className="coc-resource-input" />
                <span>/ </span>
                <input type="number" value={edited.sanityMax ?? ''} onChange={e => setField('sanityMax', parseInt(e.target.value) || 0)} className="coc-resource-input" placeholder="Max" />
              </div>
              <div className="coc-resource">
                <label>{t('coc.luck')}</label>
                <input type="number" value={edited.luck ?? ''} onChange={e => setField('luck', parseInt(e.target.value) || 0)} className="coc-resource-input" style={{ width: 60 }} />
              </div>
            </div>
            <div className="coc-resource-row">
              <div className="coc-resource">
                <label>{t('coc.damageBonus')}</label>
                <input value={edited.damageBonus || ''} onChange={e => setField('damageBonus', e.target.value)} style={{ width: 80 }} placeholder="+1d4" />
              </div>
              <div className="coc-resource">
                <label>{t('coc.build')}</label>
                <input type="number" value={edited.build ?? ''} onChange={e => setField('build', parseInt(e.target.value) || 0)} style={{ width: 60 }} />
              </div>
            </div>
          </div>

          {/* Weapons */}
          <div className="coc-section">
            <h4 className="coc-section-title">{t('coc.weapons')}</h4>
            {(edited.weapons || []).map((w, i) => (
              <div key={i} className="coc-weapon-row">
                <input
                  value={w.name || ''}
                  onChange={e => setEdited(prev => {
                    const weps = [...(prev.weapons || [])];
                    weps[i] = { ...weps[i], name: e.target.value };
                    return { ...prev, weapons: weps };
                  })}
                  placeholder={t('coc.weaponName')}
                />
                <input
                  value={w.skillKey || ''}
                  onChange={e => setEdited(prev => {
                    const weps = [...(prev.weapons || [])];
                    weps[i] = { ...weps[i], skillKey: e.target.value };
                    return { ...prev, weapons: weps };
                  })}
                  placeholder={t('coc.skillKey')}
                  style={{ width: 140 }}
                />
                <input
                  value={w.damage || ''}
                  onChange={e => setEdited(prev => {
                    const weps = [...(prev.weapons || [])];
                    weps[i] = { ...weps[i], damage: e.target.value };
                    return { ...prev, weapons: weps };
                  })}
                  placeholder="1d6+db"
                  style={{ width: 80 }}
                />
                <button
                  className="coc-remove-btn"
                  onClick={() => setEdited(prev => ({
                    ...prev,
                    weapons: (prev.weapons || []).filter((_, wi) => wi !== i)
                  }))}
                >✕</button>
              </div>
            ))}
            <button
              className="coc-add-btn"
              onClick={() => setEdited(prev => ({
                ...prev,
                weapons: [...(prev.weapons || []), { name: '', skillKey: 'fighting_brawl', damage: '1d3+db' }]
              }))}
            >+ {t('coc.addWeapon')}</button>
          </div>
        </div>
      )}

      {activeTab === 'skills' && (
        <div className="coc-skills-tab">
          <table className="coc-skills-table">
            <thead>
              <tr>
                <th>{t('coc.skill')}</th>
                <th>{t('coc.base')}</th>
                <th>{t('coc.value')}</th>
                <th>{t('coc.half')}</th>
                <th>{t('coc.fifth')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {DEFAULT_SKILLS.map(skill => {
                const val = skills[skill.key] ?? skill.base;
                return (
                  <tr key={skill.key}>
                    <td className="coc-skill-label">{skill.label}</td>
                    <td className="coc-skill-base">{skill.base}%</td>
                    <td>
                      <input
                        type="number"
                        className="coc-skill-input"
                        value={val}
                        onChange={e => setSkill(skill.key, e.target.value)}
                        min={0}
                        max={99}
                      />
                    </td>
                    <td className="coc-derived">{half(val)}</td>
                    <td className="coc-derived">{fifth(val)}</td>
                    <td>
                      {gameId && (
                        <button
                          className="coc-roll-btn"
                          onClick={() => rollSkill(skill.key)}
                          title={`Roll ${skill.label}`}
                        >🎲</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'background' && (
        <div className="coc-background-tab">
          {[
            ['personalDescription', t('coc.personalDescription')],
            ['ideology', t('coc.ideology')],
            ['traits', t('coc.traits')],
            ['injuriesScars', t('coc.injuriesScars')],
            ['phobiasManias', t('coc.phobiasManias')],
            ['arcaneTomes', t('coc.arcaneTomes')],
            ['possessions', t('coc.possessions')],
            ['spells', t('coc.spells')],
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
      )}
    </DraggablePopup>
  );
}

export default CoCCharacterSheet;
