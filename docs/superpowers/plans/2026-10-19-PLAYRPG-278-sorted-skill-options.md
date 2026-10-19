# PLAYRPG-278 Sorted Skill Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The weapons table's "options from skills" select (game sheet and creator preset editor) lists skills alphabetically by label.

**Architecture:** One change in `collectSkillOptions` (`systems/custom/skillLayout.js`) — the single source of that list for both `WeaponsTable.jsx` and `TemplateBuilder.jsx`. Sort the collected `{key, label}` list with `localeCompare` before returning. Spec: `docs/superpowers/specs/PLAYRPG-278.md`.

**Tech Stack:** React (CRA), Jest + jsdom.

## Global Constraints

- Code comments in English only.
- Sort with `a.label.localeCompare(b.label)` (no locale args) — same ordering as `buildSkillRows`.
- Always sort, regardless of any field's `sortAlphabetically`. No new flag, no backend change.
- Tests run from `warhammer-battle-helper-front/`: `CI=true npm test -- --watchAll=false --testPathPattern=<name>`. Bare `npx jest` does not work. `App.test.js` (axios ESM) is a known baseline failure.
- Before every commit check the branch in the same command: `[ "$(git branch --show-current)" = main ] && git commit ...` (shared checkout). Never stage `nginx.conf` or `package-lock.json` (user's unrelated local changes).
- Commit message trailer:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj
  ```

---

### Task 1: Sort `collectSkillOptions` alphabetically

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/skillLayout.js:61-89` (comment + return)
- Test: `warhammer-battle-helper-front/src/systems/custom/skillLayout.test.js` (import list at top + new `describe` at end)

**Interfaces:**
- Consumes: `collectSkillOptions(sections, customSkillNodes)` — existing; `sections` is `[{ fields: [...] }]`, walked by `walkFields`.
- Produces: same signature; return `{key, label}[]` now sorted by `label`.

- [ ] **Step 1: Write the failing test**

Add `collectSkillOptions` to the import list at the top of `skillLayout.test.js`:

```js
import {
  skillGridTemplate, buildSkillRows, splitHalf, siblingItems, sortItems,
  subtreeSize, splitBranchesWeighted, resolveSkillValues, isSkillBaseDerived,
  flattenTree, treeGridTemplate, collectSkillOptions,
} from './skillLayout';
```

Append at the end of the file:

```js
describe('collectSkillOptions', () => {
  it('lists every skill alphabetically, the player\'s own among the template ones', () => {
    const sections = [{
      fields: [
        { type: 'skill_table', key: 'combat', skills: [{ id: 's1', label: 'Swords' }, { id: 's2', label: 'Axes' }] },
        { type: 'skill_table', key: 'lore', skills: [{ id: 's3', label: 'History' }] },
      ],
    }];
    const customSkillNodes = { 'combat.c1': { label: 'Bows' } };
    expect(collectSkillOptions(sections, customSkillNodes)).toEqual([
      { key: 'combat.s2', label: 'Axes' },
      { key: 'combat.c1', label: 'Bows' },
      { key: 'lore.s3', label: 'History' },
      { key: 'combat.s1', label: 'Swords' },
    ]);
  });

  it('sorts skill_tree nodes flat together with table skills', () => {
    const sections = [{
      fields: [
        { type: 'skill_table', key: 'basic', skills: [{ id: 's1', label: 'Melee' }] },
        { type: 'skill_tree', key: 'tree', tree: { children: [{ key: 'craft', label: 'Craft', children: [{ key: 'alchemy', label: 'Alchemy' }] }] } },
      ],
    }];
    expect(collectSkillOptions(sections, {}).map(o => o.label)).toEqual(['Alchemy', 'Craft', 'Melee']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `warhammer-battle-helper-front/`): `CI=true npm test -- --watchAll=false --testPathPattern=skillLayout`
Expected: both new tests FAIL — received order is collection order (`Swords, Axes, History, Bows` / `Melee, Craft, Alchemy`).

- [ ] **Step 3: Implement**

In `skillLayout.js` replace the comment above `collectSkillOptions` and the `return out;` line:

```js
// collectSkillOptions gathers {key, label} for every skill the character has, sorted by label. Its
// callers are the weapons table's "from skills" select (WeaponsTable.jsx) and the creator's preset
// weapon editor (TemplateBuilder.jsx). The list is always alphabetical, whatever the skill fields'
// own sortAlphabetically says: whoever picks a weapon's skill already knows its name, and a sorted
// list is the one you can scan for a name. The select stores the key, so order carries no data.
// It lives here rather than in weaponLayout.js because what it does is compose skill keys, not lay
// out weapons: skill_table rows use `${field.key}.${opt.id}` (stable id, not the label) — the exact
// same grammar buildSkillRows below uses — and skill_tree nodes use the dot-path
// `${field.key}.${node.key}…`. Keeping every piece of skill-key composition in one file means a
// change to how a skill_table row is keyed happens in the obvious place; split across two modules,
// the weapons select could keep offering keys nothing resolves — a roll that silently misses.
export function collectSkillOptions(sections, customSkillNodes) {
```

and at the end of the function:

```js
  for (const [key, node] of Object.entries(customSkillNodes || {})) push(key, node.label);
  return out.sort((a, b) => a.label.localeCompare(b.label));
}
```

(`push` already guarantees `label` is a non-empty string — `label || key` — so `localeCompare` is safe.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true npm test -- --watchAll=false --testPathPattern="skillLayout|WeaponsTable|TablePresetsEditor|TemplateBuilder|rowTableLayout|weaponLayout"`
Expected: all PASS. If an existing test asserted the old collection order of skill options, update its expected order to alphabetical (that order change is the intended behaviour) and note it in the report.

- [ ] **Step 5: Run full frontend suite**

Run: `CI=true npm test -- --watchAll=false`
Expected: only the known `App.test.js` baseline failure.

- [ ] **Step 6: Commit**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper && [ "$(git branch --show-current)" = main ] && \
git add warhammer-battle-helper-front/src/systems/custom/skillLayout.js warhammer-battle-helper-front/src/systems/custom/skillLayout.test.js && \
git commit -m "feat: PLAYRPG-278 weapon skill select lists skills alphabetically

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YJH4MQWSk7Yax8GFgyH6Vj"
```

Manual check (user, in browser): creator → add preset weapon → open skill select; game → weapon row skill select. Both alphabetical.
