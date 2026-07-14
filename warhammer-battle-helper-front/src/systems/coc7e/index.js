import React from 'react';
import CoCCharacterSheet from './CharacterSheet';
import { buildPayload } from './buildPayload';
import CoCCharacterDetails from './CharacterDetails';
import SimpleDiceRoll from '../../components/log/SimpleDiceRoll';
import MultiDiceRoll from '../../components/log/MultiDiceRoll';
import { createSkillRoll } from './rolls/SkillRoll';
import CoCWeaponRoll from './rolls/WeaponRoll';
import SanityRoll from './rolls/SanityRoll';
import skillsData from './skills.json';

export const weaponSkills = [
  { key: 'fighting_brawl',   label: 'Fighting (Brawl)',   labelKey: 'coc.skill_fighting_brawl'   },
  { key: 'firearms_handgun', label: 'Firearms (Handgun)', labelKey: 'coc.skill_firearms_handgun' },
  { key: 'firearms_rifle',   label: 'Firearms (Rifle)',   labelKey: 'coc.skill_firearms_rifle'   },
];

export function createCharacterSheet(skills, ws) {
  return function BoundCoCCharacterSheet(props) {
    return <CoCCharacterSheet {...props} skills={skills} weaponSkills={ws} />;
  };
}

export function createCharacterDetails(skills, ws) {
  return function BoundCoCCharacterDetails(props) {
    return <CoCCharacterDetails {...props} skills={skills} weaponSkills={ws} />;
  };
}

export { createSkillRoll };

const CoCSkillRoll = createSkillRoll(skillsData);

const rollComponents = {
  simple: SimpleDiceRoll,
  multi:  MultiDiceRoll,
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
  CharacterSheet:   createCharacterSheet(skillsData, weaponSkills),
  CharacterDetails: createCharacterDetails(skillsData, weaponSkills),
  getRollComponent,
  normalizeCharacter,
  buildPayload,
  // FEATURE-102: normalizeCharacter keeps stats nested under `.stats`, so bound token
  // fields (keys relative to `stats`) resolve against the `stats` subdocument.
  statsRoot: (character) => character.stats || character,
};

export default coc7e;
