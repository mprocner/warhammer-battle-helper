import { buildPayload } from '../coc7e/buildPayload';
import SimpleDiceRoll from '../../components/log/SimpleDiceRoll';
import MultiDiceRoll from '../../components/log/MultiDiceRoll';
import { createCharacterSheet, createCharacterDetails, createSkillRoll } from '../coc7e';
import CoCWeaponRoll from '../coc7e/rolls/WeaponRoll';
import SanityRoll from '../coc7e/rolls/SanityRoll';
import skillsData from './skills.json';

const weaponSkills = [
  { key: 'fighting_brawl',  label: 'Fighting (Brawl)',  labelKey: 'coc.skill_fighting_brawl' },
  { key: 'fighting_custom', label: 'Fighting (custom)' },
  { key: 'ranged_weapon',   label: 'Ranged Weapon' },
];

const DarkAgesSkillRoll = createSkillRoll(skillsData);

const rollComponents = {
  simple: SimpleDiceRoll,
  multi:  MultiDiceRoll,
  skill:  DarkAgesSkillRoll,
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

const coc7e_dark_ages = {
  label: 'Call of Cthulhu: Dark Ages',
  supportedRollTypes: Object.keys(rollComponents),
  CharacterSheet:   createCharacterSheet(skillsData, weaponSkills),
  CharacterDetails: createCharacterDetails(skillsData, weaponSkills),
  getRollComponent,
  normalizeCharacter,
  buildPayload,
  // FEATURE-102: normalizeCharacter keeps stats nested under `.stats`, so bound token
  // fields (keys relative to `stats`) resolve against the `stats` subdocument.
  statsRoot: (character) => character.stats || character,
};

export default coc7e_dark_ages;
