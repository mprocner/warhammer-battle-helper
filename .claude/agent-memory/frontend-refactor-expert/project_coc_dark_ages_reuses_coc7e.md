---
name: coc-dark-ages-reuses-coc7e
description: coc7e_dark_ages is a thin variant that reuses coc7e roll components — changes to coc7e/ propagate to it
metadata:
  type: project
---

`src/systems/coc7e_dark_ages/index.js` is a thin variant of the Call of Cthulhu system. It only ships its own `skills.json` + `index.js`; it imports the actual roll components and factories from `coc7e/` (`CoCWeaponRoll`, `SanityRoll`, `createSkillRoll`, `createCharacterSheet`, `createCharacterDetails`, `buildPayload`).

**Why:** Dark Ages shares CoC 7e mechanics, only the skill list differs. The team factored the shared logic into `coc7e/` and parameterised it via factory functions (`createSkillRoll(skillsData)`).

**How to apply:** When refactoring anything in `src/systems/coc7e/rolls/` or shared CoC helpers (`coc7e/utils.js`, `coc7e/buildPayload.js`), the change automatically affects coc7e_dark_ages too — no separate edit needed, but check the variant still makes sense. Conversely, do NOT duplicate fixes into dark_ages; fix once in `coc7e/`. Put shared CoC outcome/roll logic in `coc7e/`, not in the variant.
