// Warhammer Fantasy Roleplay 4e — system plugin
// Wraps existing components so they work through the system registry.

import CharacterSheetPopup from '../../components/character-sheet/CharacterSheetPopup';
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

const warhammer4e = {
  CharacterSheet: CharacterSheetPopup,
  // CharacterDetails: not needed — CharacterDetailsPanel handles warhammer4e natively
  getRollComponent,
};

export default warhammer4e;
