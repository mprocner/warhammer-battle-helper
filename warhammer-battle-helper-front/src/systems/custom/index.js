import CustomCharacterSheet from './CharacterSheet';
import CustomCharacterDetails from './CharacterDetails';
import CustomRoll from './rolls/CustomRoll';
import SimpleDiceRoll from '../../components/log/SimpleDiceRoll';
import MultiDiceRoll from '../../components/log/MultiDiceRoll';

const rollComponents = {
  skill: CustomRoll,
  simple: SimpleDiceRoll,
  multi: MultiDiceRoll,
};

function getRollComponent(rollType) {
  return rollComponents[rollType] || null;
}

function normalizeCharacter(char) {
  if (!char) return char;
  const s = char.stats || {};
  return {
    ...char,
    stats: {
      attributes:       s.attributes       || {},
      skills:           s.skills           || {},
      texts:            s.texts            || {},
      progress:         s.progress         || {},
      numbers:          s.numbers          || {},
      customSkillNodes: s.customSkillNodes || {},
      favoriteSkills:   s.favoriteSkills   || [],
    },
  };
}

function buildPayload(char) {
  return char;
}

const custom = {
  label: 'Własny system',
  supportedRollTypes: Object.keys(rollComponents),
  CharacterSheet:   CustomCharacterSheet,
  CharacterDetails: CustomCharacterDetails,
  getRollComponent,
  normalizeCharacter,
  buildPayload,
};

export default custom;
