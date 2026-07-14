// Warhammer Fantasy Roleplay 4e — system plugin
// Wraps existing components so they work through the system registry.

import CharacterSheetPopup from './CharacterSheet';
import CharacterDetails from './CharacterDetails';
import { buildPayload } from './buildPayload';
import SimpleDiceRoll from '../../components/log/SimpleDiceRoll';
import MultiDiceRoll from '../../components/log/MultiDiceRoll';
import SkillRoll from './rolls/SkillRoll';
import WeaponRoll from './rolls/WeaponRoll';
import AttributeRoll from './rolls/AttributeRoll';

const rollComponents = {
  simple: SimpleDiceRoll,
  multi: MultiDiceRoll,
  skill: SkillRoll,
  weapon: WeaponRoll,
  attribute: AttributeRoll,
};

function getRollComponent(rollType) {
  return rollComponents[rollType] || null;
}

// Single source of truth for Warhammer 4e conditions. Written verbatim into
// Character.states[].name; consumed by both CharacterStates.jsx (sheet toggles) and the
// token-display builder's "preset conditions" (TokenSlotConfigModal). `icon` is a
// TOKEN_ICONS key (utils/tokenIcons.js), resolved to a component at render time.
export const states = [
  { key: 'ABLAZE', icon: 'LocalFireDepartment', labelKey: 'conditions.ablaze' },
  { key: 'BLEEDING', icon: 'Bloodtype', labelKey: 'conditions.bleeding' },
  { key: 'BLINDED', icon: 'VisibilityOff', labelKey: 'conditions.blinded' },
  { key: 'BROKEN', icon: 'HeartBroken', labelKey: 'conditions.broken' },
  { key: 'DEAFENED', icon: 'HearingDisabled', labelKey: 'conditions.deafened' },
  { key: 'ENTANGLED', icon: 'LinkOff', labelKey: 'conditions.entangled' },
  { key: 'FATIGUED', icon: 'BatteryAlert', labelKey: 'conditions.fatigued' },
  { key: 'POISON', icon: 'Sick', labelKey: 'conditions.poison' },
  { key: 'PRONE', icon: 'Hotel', labelKey: 'conditions.prone' },
  { key: 'STUNNED', icon: 'ElectricBolt', labelKey: 'conditions.stunned' },
  { key: 'SURPRISED', icon: 'CrisisAlert', labelKey: 'conditions.surprised' },
  { key: 'UNCONSCIOUS', icon: 'Bedtime', labelKey: 'conditions.unconscious' },
];

function normalizeCharacter(char) {
  if (char?.stats && typeof char.stats === 'object') {
    return { ...char.stats, ...char };
  }
  return char;
}

const warhammer4e = {
  label: 'Warhammer Fantasy Roleplay 4e',
  supportedRollTypes: Object.keys(rollComponents),
  states,
  CharacterSheet: CharacterSheetPopup,
  CharacterDetails,
  getRollComponent,
  normalizeCharacter,
  buildPayload,
  // FEATURE-102: normalizeCharacter spreads stats to the top level, so bound token
  // fields (keys relative to `stats`) resolve against the character object itself.
  statsRoot: (character) => character,
};

export default warhammer4e;
