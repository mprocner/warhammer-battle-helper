import CoCCharacterSheet from './CharacterSheet';
import CoCCharacterDetails from './CharacterDetails';
import CoCSkillRoll from './rolls/SkillRoll';
import CoCWeaponRoll from './rolls/WeaponRoll';
import SanityRoll from './rolls/SanityRoll';

const rollComponents = {
  skill:  CoCSkillRoll,
  weapon: CoCWeaponRoll,
  sanity: SanityRoll,
};

function getRollComponent(rollType) {
  return rollComponents[rollType] || null;
}

const coc7e = {
  CharacterSheet:   CoCCharacterSheet,
  CharacterDetails: CoCCharacterDetails,
  getRollComponent,
};

export default coc7e;
