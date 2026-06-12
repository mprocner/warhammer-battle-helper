import DnD5eCharacterSheet   from './CharacterSheet';
import DnD5eCharacterDetails from './CharacterDetails';
import { buildPayload }       from './buildPayload';
import SimpleDiceRoll         from '../../components/log/SimpleDiceRoll';
import MultiDiceRoll          from '../../components/log/MultiDiceRoll';
import DnD5eSkillRoll         from './rolls/SkillRoll';
import DnD5eWeaponRoll        from './rolls/WeaponRoll';

const rollComponents = {
  simple: SimpleDiceRoll,
  multi:  MultiDiceRoll,
  skill:  DnD5eSkillRoll,
  weapon: DnD5eWeaponRoll,
};

function getRollComponent(rollType) {
  return rollComponents[rollType] || null;
}

function normalizeCharacter(char) {
  if (!char) return char;
  const stats = char.stats || {};
  return {
    ...char,
    stats: {
      ...stats,
      info:             stats.info             || { level: 1 },
      abilities:        stats.abilities        || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      savingThrowProfs: stats.savingThrowProfs || {},
      skillProfs:       stats.skillProfs       || {},
      resources:        stats.resources        || {},
      derived:          stats.derived          || {},
      spellSlots:       stats.spellSlots       || [],
      weapons:          stats.weapons          || [],
      features:         stats.features         || [],
      favoriteSkills:   stats.favoriteSkills   || [],
      favoriteWeapons:  stats.favoriteWeapons  || [],
    },
  };
}

const dnd5e = {
  label: 'D&D 5e',
  supportedRollTypes: Object.keys(rollComponents),
  CharacterSheet:   DnD5eCharacterSheet,
  CharacterDetails: DnD5eCharacterDetails,
  getRollComponent,
  normalizeCharacter,
  buildPayload,
};

export default dnd5e;
