// Warhammer Fantasy Roleplay 4e — system plugin
// Wraps existing components so they work through the system registry.

import CharacterSheetPopup from './CharacterSheet';
import CharacterDetails from './CharacterDetails';
import { buildPayload } from './buildPayload';
import SkillRoll from '../../components/log/SkillRoll';
import WeaponRoll from '../../components/log/WeaponRoll';
import AttributeRoll from '../../components/log/AttributeRoll';

const rollComponents = {
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
  CharacterSheet: CharacterSheetPopup,
  CharacterDetails,
  getRollComponent,
  normalizeCharacter,
  buildPayload,
};

export default warhammer4e;
