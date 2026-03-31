// Warhammer Fantasy Roleplay 4e — system plugin
// Wraps existing components so they work through the system registry.

import CharacterSheetPopup from './CharacterSheet';
import CharacterDetails from './CharacterDetails';
import { buildPayload } from './buildPayload';
import SimpleDiceRoll from '../../components/log/SimpleDiceRoll';
import SkillRoll from './rolls/SkillRoll';
import WeaponRoll from './rolls/WeaponRoll';
import AttributeRoll from './rolls/AttributeRoll';

const rollComponents = {
  simple: SimpleDiceRoll,
  skill: SkillRoll,
  weapon: WeaponRoll,
  attribute: AttributeRoll,
};

function getRollComponent(rollType) {
  return rollComponents[rollType] || null;
}

function normalizeCharacter(char) {
  if (char?.stats && typeof char.stats === 'object') {
    return { ...char.stats, ...char };
  }
  return char;
}

const warhammer4e = {
  label: 'Warhammer Fantasy Roleplay 4e',
  supportedRollTypes: Object.keys(rollComponents),
  CharacterSheet: CharacterSheetPopup,
  CharacterDetails,
  getRollComponent,
  normalizeCharacter,
  buildPayload,
};

export default warhammer4e;
