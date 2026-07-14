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

// Single source of truth for D&D 5e conditions (PHB). Written verbatim into
// Character.states[].name; consumed by CharacterStates.jsx and the token-display builder.
// `icon` is a TOKEN_ICONS key. Conditions shared with Warhammer reuse the existing
// conditions.* translation keys to avoid near-duplicate strings (e.g. POISONED →
// conditions.poison). Exhaustion is leveled — the token overlay renders states[].level.
export const states = [
  { key: 'BLINDED', icon: 'VisibilityOff', labelKey: 'conditions.blinded' },
  { key: 'CHARMED', icon: 'Favorite', labelKey: 'conditions.charmed' },
  { key: 'DEAFENED', icon: 'HearingDisabled', labelKey: 'conditions.deafened' },
  { key: 'FRIGHTENED', icon: 'SentimentVeryDissatisfied', labelKey: 'conditions.frightened' },
  { key: 'GRAPPLED', icon: 'PanTool', labelKey: 'conditions.grappled' },
  { key: 'INCAPACITATED', icon: 'Block', labelKey: 'conditions.incapacitated' },
  { key: 'INVISIBLE', icon: 'BlurOn', labelKey: 'conditions.invisible' },
  { key: 'PARALYZED', icon: 'AcUnit', labelKey: 'conditions.paralyzed' },
  { key: 'PETRIFIED', icon: 'Diamond', labelKey: 'conditions.petrified' },
  { key: 'POISONED', icon: 'Sick', labelKey: 'conditions.poison' },
  { key: 'PRONE', icon: 'Hotel', labelKey: 'conditions.prone' },
  { key: 'RESTRAINED', icon: 'Lock', labelKey: 'conditions.restrained' },
  { key: 'STUNNED', icon: 'ElectricBolt', labelKey: 'conditions.stunned' },
  { key: 'UNCONSCIOUS', icon: 'Bedtime', labelKey: 'conditions.unconscious' },
  { key: 'EXHAUSTION', icon: 'BatteryAlert', labelKey: 'conditions.exhaustion' },
];

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
  states,
  CharacterSheet:   DnD5eCharacterSheet,
  CharacterDetails: DnD5eCharacterDetails,
  getRollComponent,
  normalizeCharacter,
  buildPayload,
  // FEATURE-102: normalizeCharacter keeps stats nested under `.stats`, so bound token
  // fields (keys relative to `stats`) resolve against the `stats` subdocument.
  statsRoot: (character) => character.stats || character,
};

export default dnd5e;
