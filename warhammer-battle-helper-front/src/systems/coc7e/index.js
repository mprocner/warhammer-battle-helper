import CoCCharacterSheet from './CharacterSheet';
import { buildPayload } from './buildPayload';
import CoCCharacterDetails from './CharacterDetails';
import SimpleDiceRoll from '../../components/log/SimpleDiceRoll';
import CoCSkillRoll from './rolls/SkillRoll';
import CoCWeaponRoll from './rolls/WeaponRoll';
import SanityRoll from './rolls/SanityRoll';

const rollComponents = {
  simple: SimpleDiceRoll,
  skill:  CoCSkillRoll,
  weapon: CoCWeaponRoll,
  sanity: SanityRoll,
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
            basicInfo:         stats.basicInfo         || {},
            attributes:        stats.attributes        || {},
            resources:         stats.resources         || {},
            combat:            stats.combat            || {},
            finances:          stats.finances          || {},
            background:        stats.background        || {},
            skills:            stats.skills            || {},
            customSkills:      stats.customSkills      || [],
            favoriteSkills:    stats.favoriteSkills    || [],
            developmentSkills: stats.developmentSkills || [],
            weapons:           stats.weapons           || [],
        },
    };
}

const coc7e = {
  label: 'Call of Cthulhu 7e',
  supportedRollTypes: Object.keys(rollComponents),
  CharacterSheet:   CoCCharacterSheet,
  CharacterDetails: CoCCharacterDetails,
  getRollComponent,
  normalizeCharacter,
  buildPayload,
};

export default coc7e;
