import CustomCharacterSheet from './CharacterSheet';
import CustomCharacterDetails from './CharacterDetails';
import CustomRoll from './rolls/CustomRoll';
import SimpleDiceRoll from '../../components/log/SimpleDiceRoll';

const rollComponents = {
  skill: CustomRoll,
  simple: SimpleDiceRoll,
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
      advances:         s.advances         || {},
      skills:           s.skills           || {},
      texts:            s.texts            || {},
      progress:         s.progress         || {},
      customSkillNodes: s.customSkillNodes || {},
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
