# FEATURE-211 Nested Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a character-sheet template section contain other sections, each configurable exactly like a top-level one, at unlimited depth.

**Architecture:** A nested section is a `FieldDef` of type `"section"` wrapping a `*SectionDef`, so the section shape is identical at every depth and the ordered `fields` array carries fields and subsections in one list. All tree manipulation moves out of `TemplateBuilder.jsx` into a new pure module `src/utils/templateSections.js` addressed by **path** (`number[]`), which is what makes the drag & drop rewrite and the recursion in five front-end consumers testable without DOM.

**Tech Stack:** React 18 + @dnd-kit (front), Go + MongoDB (back), jest via CRA, i18next.

## Global Constraints

- Spec: `docs/superpowers/specs/FEATURE-211.md`. Read it before Task 1.
- Comments in code are **always English**, backend and frontend, no exceptions. Docs and commit bodies may stay Polish; these commits use English.
- Every user-facing string goes through `t('key')` with an **English key**; add the value to `src/locales/en/translation.json` and `src/locales/pl/translation.json` in the same commit.
- Icons come from `@mui/icons-material` only. No inline SVG, no other icon library.
- Front tests run as `CI=true npm test -- --watchAll=false` from `warhammer-battle-helper-front/`; a single file with `--testPathPattern=<name>`. Bare `npx jest` does not work — CRA owns the config.
- `App.test.js` fails on an axios ESM error. That is the known baseline, not a regression.
- Backend tests run as `go test ./...` from `warhammer-battle-helper-backend/`.
- No backward compatibility is required for stored data.
- Invariant to preserve everywhere a section node is created or copied: `field.section.id === field.key`.

---

### Task 1: Pure tree module `templateSections.js`

**Files:**
- Create: `warhammer-battle-helper-front/src/utils/templateSections.js`
- Test: `warhammer-battle-helper-front/src/utils/templateSections.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `SECTION_TYPE`, `sectionOf(node)`, `childrenOf(node)`, `locate(sections, path)`, `nodeAt(sections, path)`, `updateAtPath(sections, path, patch)`, `insertAtPath(sections, parentPath, index, node)`, `removeAtPath(sections, path)`, `moveNode(sections, fromPath, toParentPath, toIndex)`, `duplicateNodeAtPath(sections, path, {mint, copySuffix})`, `indexNodes(sections)`, `nodeId(node)`, `walkFields(sections, fn)`, `isAncestorPath(a, b)`, `isContainer(node)`.

- [ ] **Step 1: Write the failing test**

Create `warhammer-battle-helper-front/src/utils/templateSections.test.js`:

```js
import {
  SECTION_TYPE, childrenOf, nodeAt, updateAtPath, insertAtPath, removeAtPath,
  moveNode, duplicateNodeAtPath, indexNodes, walkFields, isAncestorPath,
} from './templateSections';

// Fixture: two root sections; the second holds a field, a nested section with two fields,
// and that nested section holds a deeper section — three levels in total.
const makeTree = () => ([
  { id: 'sec_a', title: 'A', columns: 3, fields: [
    { key: 'attr_1', type: 'attr', label: 'Siła' },
  ] },
  { id: 'sec_b', title: 'B', columns: 2, fields: [
    { key: 'num_1', type: 'number', label: 'Złoto' },
    { key: 'sec_c', type: SECTION_TYPE, label: '', section: { id: 'sec_c', title: 'C', columns: 2, fields: [
      { key: 'attr_2', type: 'attr', label: 'Zręczność' },
      { key: 'sec_d', type: SECTION_TYPE, label: '', section: { id: 'sec_d', title: 'D', columns: 1, fields: [
        { key: 'txt_1', type: 'text_short', label: 'Notka' },
      ] } },
    ] } },
  ] },
]);

let mintCounter = 0;
const mint = (prefix) => `${prefix}_mint${++mintCounter}`;
beforeEach(() => { mintCounter = 0; });

describe('childrenOf', () => {
  test('returns fields of a root section', () => {
    expect(childrenOf(makeTree()[0]).map(f => f.key)).toEqual(['attr_1']);
  });

  test('unwraps a section field to its nested fields', () => {
    const wrapper = makeTree()[1].fields[1];
    expect(childrenOf(wrapper).map(f => f.key)).toEqual(['attr_2', 'sec_d']);
  });

  test('returns null for a leaf field', () => {
    expect(childrenOf(makeTree()[0].fields[0])).toBeNull();
  });
});

describe('nodeAt', () => {
  test('addresses a leaf three levels deep', () => {
    expect(nodeAt(makeTree(), [1, 1, 1, 0]).key).toBe('txt_1');
  });

  test('returns null for a path that runs off the tree', () => {
    expect(nodeAt(makeTree(), [1, 1, 9])).toBeNull();
  });

  test('returns null for an empty path', () => {
    expect(nodeAt(makeTree(), [])).toBeNull();
  });
});

describe('updateAtPath', () => {
  test('patches a nested section title on its SectionDef, not on the wrapper', () => {
    const next = updateAtPath(makeTree(), [1, 1], { title: 'Broń' });
    expect(next[1].fields[1].section.title).toBe('Broń');
    expect(next[1].fields[1].title).toBeUndefined();
  });

  test('patches a root section directly', () => {
    expect(updateAtPath(makeTree(), [0], { columns: 6 })[0].columns).toBe(6);
  });

  test('patches a leaf field directly', () => {
    expect(updateAtPath(makeTree(), [0, 0], { label: 'S' })[0].fields[0].label).toBe('S');
  });

  test('does not mutate the input', () => {
    const tree = makeTree();
    updateAtPath(tree, [1, 1], { title: 'X' });
    expect(tree[1].fields[1].section.title).toBe('C');
  });
});

describe('insertAtPath / removeAtPath', () => {
  test('inserts into a nested section at an index', () => {
    const node = { key: 'new_1', type: 'checkbox', label: '' };
    const next = insertAtPath(makeTree(), [1, 1], 1, node);
    expect(next[1].fields[1].section.fields.map(f => f.key)).toEqual(['attr_2', 'new_1', 'sec_d']);
  });

  test('inserts into the root list with an empty parent path', () => {
    const node = { id: 'sec_new', title: '', columns: 3, fields: [] };
    expect(insertAtPath(makeTree(), [], 0, node).map(s => s.id)).toEqual(['sec_new', 'sec_a', 'sec_b']);
  });

  test('removes a nested section together with its whole subtree', () => {
    const next = removeAtPath(makeTree(), [1, 1]);
    expect(next[1].fields.map(f => f.key)).toEqual(['num_1']);
  });
});

describe('moveNode', () => {
  test('moves a leaf from a root section into a section two levels down', () => {
    const next = moveNode(makeTree(), [0, 0], [1, 1, 1], 0);
    expect(next[0].fields).toHaveLength(0);
    expect(next[1].fields[1].section.fields[1].section.fields.map(f => f.key)).toEqual(['attr_1', 'txt_1']);
  });

  test('reorders within the same parent, compensating for the removal', () => {
    const tree = makeTree();
    const next = moveNode(tree, [1, 0], [1], 2);
    expect(next[1].fields.map(f => f.key)).toEqual(['sec_c', 'num_1']);
  });

  test('refuses to drop a section inside its own subtree', () => {
    const tree = makeTree();
    expect(moveNode(tree, [1, 1], [1, 1, 1], 0)).toBe(tree);
  });

  test('refuses to drop a node into the parent slot it already occupies', () => {
    const tree = makeTree();
    expect(moveNode(tree, [1, 1], [1, 1], 0)).toBe(tree);
  });

  test('shifts a target path that sits after the removed node in the same list', () => {
    // Move root section A into section B: the target parent [1] must become [0] after removal.
    const next = moveNode(makeTree(), [0], [1], 0);
    expect(next).toHaveLength(1);
    expect(next[0].fields[0].key).toBe('sec_a');
  });

  test('wraps a root section into a section field when it moves inside another section', () => {
    const moved = moveNode(makeTree(), [0], [1], 0)[0].fields[0];
    expect(moved.type).toBe(SECTION_TYPE);
    expect(moved.key).toBe('sec_a');
    expect(moved.section.id).toBe('sec_a');
    expect(moved.section.title).toBe('A');
    expect(moved.section.fields.map(f => f.key)).toEqual(['attr_1']);
  });

  test('unwraps a nested section into a root SectionDef when it moves to the root list', () => {
    const next = moveNode(makeTree(), [1, 1], [], 0);
    expect(next[0].id).toBe('sec_c');
    expect(next[0].type).toBeUndefined();
    expect(next[0].title).toBe('C');
    expect(next[0].fields.map(f => f.key)).toEqual(['attr_2', 'sec_d']);
  });

  test('refuses to move a leaf field into the root list', () => {
    const tree = makeTree();
    expect(moveNode(tree, [0, 0], [], 0)).toBe(tree);
  });
});

describe('duplicateNodeAtPath', () => {
  test('re-mints every descendant key of a copied section', () => {
    const next = duplicateNodeAtPath(makeTree(), [1, 1], { mint, copySuffix: '(kopia)' });
    const copy = next[1].fields[2];
    const original = next[1].fields[1];
    expect(copy.key).not.toBe(original.key);
    expect(copy.section.fields[0].key).not.toBe('attr_2');
    expect(copy.section.fields[1].section.fields[0].key).not.toBe('txt_1');
  });

  test('keeps section.id equal to the wrapper key in the copy', () => {
    const copy = duplicateNodeAtPath(makeTree(), [1, 1], { mint, copySuffix: '(kopia)' })[1].fields[2];
    expect(copy.section.id).toBe(copy.key);
    expect(copy.section.fields[1].section.id).toBe(copy.section.fields[1].key);
  });

  test('suffixes a section copy title and a field copy label', () => {
    const next = duplicateNodeAtPath(makeTree(), [1, 1], { mint, copySuffix: '(kopia)' });
    expect(next[1].fields[2].section.title).toBe('C (kopia)');
    const withField = duplicateNodeAtPath(makeTree(), [0, 0], { mint, copySuffix: '(kopia)' });
    expect(withField[0].fields[1].label).toBe('Siła (kopia)');
  });

  test('re-mints a copied ROOT section by id, without giving it a key', () => {
    const next = duplicateNodeAtPath(makeTree(), [1], { mint, copySuffix: '(kopia)' });
    const copy = next[2];
    expect(copy.id).not.toBe('sec_b');
    expect(copy.key).toBeUndefined();
    expect(copy.title).toBe('B (kopia)');
    expect(next[1].title).toBe('B');
    expect(copy.fields[0].key).not.toBe('num_1');
    expect(copy.fields[1].section.fields[0].key).not.toBe('attr_2');
    expect(copy.fields[1].section.id).toBe(copy.fields[1].key);
  });

  test('leaves the inner ids of a plain field alone', () => {
    const tree = [{ id: 'sec_a', title: '', columns: 1, fields: [
      { key: 'st_1', type: 'skill_table', skills: [{ id: 'opt_1', label: 'Skradanie' }] },
    ] }];
    const copy = duplicateNodeAtPath(tree, [0, 0], { mint, copySuffix: '(kopia)' })[0].fields[1];
    expect(copy.skills[0].id).toBe('opt_1');
    expect(copy.key).not.toBe('st_1');
  });
});

describe('indexNodes', () => {
  test('maps every node id to its path, root sections by id and fields by key', () => {
    const map = indexNodes(makeTree());
    expect(map.get('sec_a')).toEqual([0]);
    expect(map.get('num_1')).toEqual([1, 0]);
    expect(map.get('sec_c')).toEqual([1, 1]);
    expect(map.get('txt_1')).toEqual([1, 1, 1, 0]);
  });
});

describe('walkFields', () => {
  test('visits leaf fields in sheet order and skips section wrappers', () => {
    const seen = [];
    walkFields(makeTree(), f => seen.push(f.key));
    expect(seen).toEqual(['attr_1', 'num_1', 'attr_2', 'txt_1']);
  });
});

describe('isAncestorPath', () => {
  test('is true for a strict prefix and false for equal or unrelated paths', () => {
    expect(isAncestorPath([1, 1], [1, 1, 0])).toBe(true);
    expect(isAncestorPath([1, 1], [1, 1])).toBe(false);
    expect(isAncestorPath([1, 1], [1, 0, 0])).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `warhammer-battle-helper-front/`:

```bash
CI=true npm test -- --watchAll=false --testPathPattern=templateSections
```

Expected: FAIL — `Cannot find module './templateSections' from 'src/utils/templateSections.test.js'`.

- [ ] **Step 3: Write the implementation**

Create `warhammer-battle-helper-front/src/utils/templateSections.js`:

```js
/**
 * Tree operations for creator templates.
 *
 * A template is a forest: `sections` is the root list, every section owns an ordered
 * `fields` array, and a field of type "section" carries a whole nested section in
 * `field.section`. Fields and subsections therefore share one ordered list, which is what
 * lets a subsection occupy a single cell of its parent's grid.
 *
 * Every helper addresses a node by PATH — an array of indices, e.g. [2, 0, 1] means
 * sections[2].fields[0].section.fields[1]. Paths replace the old {sectionIdx, fieldIdx}
 * pair, which could only describe two levels.
 *
 * All helpers are pure and return new arrays; nothing here touches the DOM, so the whole
 * module is testable with plain jest.
 */

export const SECTION_TYPE = 'section';

// sectionOf normalises the two shapes a "section" comes in: a root SectionDef is already
// one, a section field wraps one. A leaf field is returned as-is and simply has no fields.
export const sectionOf = (node) =>
  node && node.type === SECTION_TYPE ? node.section : node;

// childrenOf returns the ordered child list of a container node, or null for a leaf field.
export const childrenOf = (node) => {
  const section = sectionOf(node);
  return section && Array.isArray(section.fields) ? section.fields : null;
};

// nodeId is the identity a node is addressed by in DnD and in React keys. Root sections
// carry `id`, fields carry `key`, and a section field keeps both in sync (section.id === key).
export const nodeId = (node) => (node ? (node.key ?? node.id) : null);

// locate resolves a path to the node, the list holding it and its index in that list.
export function locate(sections, path) {
  if (!Array.isArray(path) || path.length === 0) return null;
  let list = sections;
  for (let i = 0; i < path.length - 1; i++) {
    const kids = childrenOf(list?.[path[i]]);
    if (!kids) return null;
    list = kids;
  }
  const index = path[path.length - 1];
  const node = list?.[index];
  if (!node) return null;
  return { node, siblings: list, index };
}

export const nodeAt = (sections, path) => locate(sections, path)?.node ?? null;

// isContainer tells a section (of either shape) from a leaf field.
export const isContainer = (node) => childrenOf(node) !== null;

// A section exists in two shapes: a root SectionDef (carries `id`, lives in `sections`) and a
// section field (carries `key` + `type`, lives in a `fields` array and wraps the SectionDef).
// Moving a section across the root boundary has to convert between them — the conversion is
// lossless because section.id and the wrapper key are the same string by invariant.
const asRootSection = (node) => (node.type === SECTION_TYPE ? { ...node.section } : node);

const asFieldNode = (node) =>
  node.key !== undefined ? node : { key: node.id, type: SECTION_TYPE, label: '', section: node };

// withChildren rebuilds a container node around a new child list, for both shapes.
function withChildren(node, fields) {
  return node.type === SECTION_TYPE
    ? { ...node, section: { ...node.section, fields } }
    : { ...node, fields };
}

// mapSiblings replaces the child list living at `parentPath` with fn(list), cloning every
// node along the way so the caller's tree is never mutated. An empty path means the root list.
function mapSiblings(sections, parentPath, fn) {
  if (parentPath.length === 0) return fn(sections);
  const [head, ...rest] = parentPath;
  return sections.map((node, i) => {
    if (i !== head) return node;
    return withChildren(node, mapSiblings(childrenOf(node) || [], rest, fn));
  });
}

// patchNode applies a property patch where the caller means it: a section's title and
// columns live on its SectionDef, a leaf field's properties on the field itself.
function patchNode(node, patch) {
  return node.type === SECTION_TYPE
    ? { ...node, section: { ...node.section, ...patch } }
    : { ...node, ...patch };
}

export const updateAtPath = (sections, path, patch) =>
  mapSiblings(sections, path.slice(0, -1), (list) =>
    list.map((n, i) => (i === path[path.length - 1] ? patchNode(n, patch) : n)));

export const insertAtPath = (sections, parentPath, index, node) =>
  mapSiblings(sections, parentPath, (list) => {
    const next = [...list];
    next.splice(index < 0 || index > list.length ? list.length : index, 0, node);
    return next;
  });

export const removeAtPath = (sections, path) =>
  mapSiblings(sections, path.slice(0, -1), (list) =>
    list.filter((_, i) => i !== path[path.length - 1]));

export const samePath = (a, b) =>
  Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => b[i] === v);

// isAncestorPath is the cycle guard: dropping a section into its own subtree would make the
// node disappear together with the list it was being inserted into.
export const isAncestorPath = (ancestor, descendant) =>
  Array.isArray(ancestor) && Array.isArray(descendant) &&
  ancestor.length < descendant.length && ancestor.every((v, i) => descendant[i] === v);

// shiftPathAfterRemoval fixes a path that pointed past the node just removed. Only indices
// in the removed node's own list move, and only those after it.
function shiftPathAfterRemoval(path, removedPath) {
  const depth = removedPath.length - 1;
  if (path.length <= depth) return path;
  const parent = removedPath.slice(0, depth);
  if (!parent.every((v, i) => path[i] === v)) return path;
  if (path[depth] <= removedPath[depth]) return path;
  const out = [...path];
  out[depth] -= 1;
  return out;
}

export function moveNode(sections, fromPath, toParentPath, toIndex) {
  if (!Array.isArray(fromPath) || !Array.isArray(toParentPath)) return sections;
  if (isAncestorPath(fromPath, toParentPath) || samePath(fromPath, toParentPath)) return sections;
  const found = locate(sections, fromPath);
  if (!found) return sections;

  const fromParent = fromPath.slice(0, -1);
  const fromIndex = fromPath[fromPath.length - 1];
  // The root list holds SectionDefs, every other list holds fields. A leaf field therefore
  // cannot become a root section, and a section changes shape when it crosses that boundary.
  const toRoot = toParentPath.length === 0;
  if (toRoot && !isContainer(found.node)) return sections;
  const node = toRoot ? asRootSection(found.node) : asFieldNode(found.node);

  const withoutNode = removeAtPath(sections, fromPath);
  const parentPath = shiftPathAfterRemoval(toParentPath, fromPath);
  // Same list: every slot after the removed one shifted down by one, target included.
  const index = samePath(fromParent, toParentPath) && toIndex > fromIndex ? toIndex - 1 : toIndex;
  return insertAtPath(withoutNode, parentPath, index, node);
}

// remintKeys gives a copied node a fresh identity. Three cases, and they are told apart by
// SHAPE, not by `type`: a root SectionDef has no `type` either, so testing only for
// `type !== SECTION_TYPE` would treat a whole root section as a leaf field and leave its id
// and every descendant key colliding with the original.
//
// A leaf field only needs its own key replaced: its inner ids (skill option ids, tree node
// keys) are addressed as "<fieldKey>.<innerId>", so a new field key already makes the whole
// address unique. A section of either shape must go deeper — its descendants are real fields
// with their own top-level keys in Character.Stats, and reusing them would collide with the
// original on every character.
function remintKeys(node, mint) {
  if (node.type === SECTION_TYPE) {
    const key = mint(SECTION_TYPE);
    return {
      ...node,
      key,
      section: {
        ...node.section,
        id: key,
        fields: (node.section?.fields || []).map((child) => remintKeys(child, mint)),
      },
    };
  }
  if (isContainer(node)) {
    // Root SectionDef: it is addressed by `id` and must not grow a `key`.
    return {
      ...node,
      id: mint(SECTION_TYPE),
      fields: (node.fields || []).map((child) => remintKeys(child, mint)),
    };
  }
  return { ...node, key: mint(node.type) };
}

export function duplicateNodeAtPath(sections, path, { mint, copySuffix }) {
  const found = locate(sections, path);
  if (!found) return sections;
  const copy = remintKeys(JSON.parse(JSON.stringify(found.node)), mint);
  // sectionOf normalises both section shapes, so the suffix lands on the title of a root
  // section and of a nested one alike.
  const copiedSection = isContainer(copy) ? sectionOf(copy) : null;
  if (copiedSection) {
    copiedSection.title = `${copiedSection.title || ''} ${copySuffix}`.trim();
  } else if (copy.label) {
    copy.label = `${copy.label} ${copySuffix}`;
  }
  return insertAtPath(sections, path.slice(0, -1), path[path.length - 1] + 1, copy);
}

// indexNodes builds the id → path map the DnD handlers translate through: dnd-kit hands back
// the dragged and hovered ids, and everything downstream works on paths.
export function indexNodes(sections) {
  const map = new Map();
  const visit = (list, prefix) => {
    (list || []).forEach((node, i) => {
      const path = [...prefix, i];
      map.set(nodeId(node), path);
      const kids = childrenOf(node);
      if (kids) visit(kids, path);
    });
  };
  visit(sections, []);
  return map;
}

// walkFields visits every LEAF field depth-first in sheet order, skipping section wrappers.
// It is the single traversal behind duplicate-key detection, the attribute list, the skill
// option list and the token-display field picker.
export function walkFields(sections, fn) {
  const visit = (list) => {
    for (const node of list || []) {
      if (node.type === SECTION_TYPE) visit(node.section?.fields);
      else fn(node);
    }
  };
  for (const section of sections || []) visit(section.fields);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=templateSections
```

Expected: PASS, all suites in that file green.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-front/src/utils/templateSections.js warhammer-battle-helper-front/src/utils/templateSections.test.js
git commit -m "feat: FEATURE-211 path-addressed tree operations for template sections"
```

---

### Task 2: Backend model and recursive traversals

**Files:**
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go` (add `Section` to `FieldDef`)
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/plugin.go:83` and `:167`
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/roller.go:579`
- Modify: `warhammer-battle-helper-backend/internal/systems/custom/weapon.go:125` (`findWeaponField`)
- Test: `warhammer-battle-helper-backend/internal/systems/custom/nested_sections_test.go` (new)

**Interfaces:**
- Consumes: nothing from Task 1 (separate stack).
- Produces: `models.FieldDef.Section *models.SectionDef`; helper `flattenFields(fields []models.FieldDef) []models.FieldDef` in package `custom`.

- [ ] **Step 1: Write the failing test**

Create `warhammer-battle-helper-backend/internal/systems/custom/nested_sections_test.go`:

```go
package custom

import (
	"testing"

	"warhammer-battle-helper/internal/models"
)

// nestedTemplate builds a template whose only attribute lives two sections deep, so any
// traversal that stops at the first level simply cannot see it.
func nestedTemplate() *models.SystemTemplate {
	def := 7
	inner := &models.SectionDef{
		ID: "sec_inner", Title: "Inner", Columns: 2,
		Fields: []models.FieldDef{
			{Key: "attr_deep", Type: "attr", Label: "Deep", Default: &def,
				RollConfig: &models.RollConfig{}},
		},
	}
	return &models.SystemTemplate{
		Sections: []models.SectionDef{
			{ID: "sec_root", Title: "Root", Columns: 3, Fields: []models.FieldDef{
				{Key: "sec_inner", Type: "section", Section: inner},
			}},
		},
	}
}

func TestFlattenFieldsReachesNestedSections(t *testing.T) {
	flat := flattenFields(nestedTemplate().Sections[0].Fields)
	if len(flat) != 1 || flat[0].Key != "attr_deep" {
		t.Fatalf("expected the nested attribute, got %+v", flat)
	}
}

func TestDefaultStatsAppliesDefaultsInsideNestedSection(t *testing.T) {
	stats, err := defaultStatsFor(nestedTemplate())
	if err != nil {
		t.Fatalf("defaultStatsFor: %v", err)
	}
	if got := stats.Attributes["attr_deep"].Base; got != 7 {
		t.Fatalf("expected default 7 for the nested attribute, got %d", got)
	}
}

func TestResolveRollConfigFindsNestedField(t *testing.T) {
	cfg, _, fieldType, err := resolveRollConfig(nestedTemplate(), &Stats{}, "attr_deep")
	if err != nil {
		t.Fatalf("resolveRollConfig: %v", err)
	}
	if cfg == nil || fieldType != "attr" {
		t.Fatalf("expected an attr roll config, got cfg=%v type=%q", cfg, fieldType)
	}
}

func TestResolveSkillLabelFindsNestedField(t *testing.T) {
	if got := resolveSkillLabel(nestedTemplate(), &Stats{}, "attr_deep"); got != "Deep" {
		t.Fatalf("expected the nested label, got %q", got)
	}
}
```

**Before running:** open `plugin.go` and find the exported entry point that fills a new character's stats (the function containing the loop at `plugin.go:83`). If its name differs from `defaultStatsFor`, rename the call in `TestDefaultStatsAppliesDefaultsInsideNestedSection` to match, and adapt the returned type to whatever that function returns. Do not rename production code to fit the test.

- [ ] **Step 2: Run the test to verify it fails**

Run from `warhammer-battle-helper-backend/`:

```bash
go test ./internal/systems/custom/ -run 'Nested|flattenFields' -v
```

Expected: FAIL — `undefined: flattenFields`, and `unknown field Section in struct literal of type models.FieldDef`.

- [ ] **Step 3: Write the implementation**

In `internal/models/SystemTemplate.go`, add to `FieldDef` (right after `PresetWeapons`):

```go
	// Section holds the nested section when Type == "section" (FEATURE-211). A section field
	// carries no per-character value — its Key never appears in Character.Stats, exactly like
	// "label". The recursion runs SectionDef -> FieldDef -> *SectionDef, so this is a pointer,
	// not a value: a value would make the struct infinitely sized.
	Section *SectionDef `bson:"section,omitempty" json:"section,omitempty"`
```

In `internal/systems/custom/plugin.go`, add near the other helpers:

```go
// flattenFields returns every leaf field of the given list, descending into nested
// sections. Section wrappers themselves are dropped: they hold no value, no roll config and
// no label worth resolving, so every caller wants the leaves only.
func flattenFields(fields []models.FieldDef) []models.FieldDef {
	out := make([]models.FieldDef, 0, len(fields))
	for _, field := range fields {
		if field.Type == "section" {
			if field.Section != nil {
				out = append(out, flattenFields(field.Section.Fields)...)
			}
			continue
		}
		out = append(out, field)
	}
	return out
}
```

Then change all three traversals to iterate the flattened list. In `plugin.go:83`:

```go
	for _, section := range tmpl.Sections {
		for _, field := range flattenFields(section.Fields) {
```

In `plugin.go:167` (`resolveRollConfig`):

```go
	for _, section := range template.Sections {
		for _, field := range flattenFields(section.Fields) {
```

In `roller.go:579` (`resolveSkillLabel`):

```go
	for _, section := range template.Sections {
		for _, field := range flattenFields(section.Fields) {
```

The fourth traversal, `findWeaponField` in `weapon.go:125`, must NOT go through `flattenFields`:
it returns `*models.FieldDef` pointing INTO the template, because callers read the field's
GM-authored presets through it, and `flattenFields` returns copies. Give it its own recursion
that takes the address of a slice element:

```go
// findWeaponFieldIn searches one field list, descending into nested sections. It returns a
// pointer into the template's own backing array — callers read GM-authored presets through
// it — so this cannot be folded into flattenFields, which returns copies.
func findWeaponFieldIn(fields []models.FieldDef, fieldKey string) (*models.FieldDef, bool) {
	for fi := range fields {
		f := &fields[fi]
		if f.Type == "section" {
			if f.Section != nil {
				if found, ok := findWeaponFieldIn(f.Section.Fields, fieldKey); ok {
					return found, true
				}
			}
			continue
		}
		if f.Key == fieldKey && f.Type == "weapons_table" {
			return f, true
		}
	}
	return nil, false
}

func findWeaponField(template *models.SystemTemplate, fieldKey string) (*models.FieldDef, bool) {
	for si := range template.Sections {
		if f, ok := findWeaponFieldIn(template.Sections[si].Fields, fieldKey); ok {
			return f, true
		}
	}
	return nil, false
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
go test ./internal/systems/custom/ -run 'Nested|flattenFields' -v
go test ./...
```

Expected: the four new tests PASS, and the full suite stays green.

- [ ] **Step 5: Commit**

```bash
git add warhammer-battle-helper-backend/
git commit -m "feat: FEATURE-211 nested section support in the custom system plugin"
```

---

### Task 3: Delete the dead `showToPlayer` flag

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx:128` and `:820-821`
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `src/locales/pl/translation.json`
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate.go:215`
- Modify: `warhammer-battle-helper-backend/internal/models/SystemTemplate_test.go:20`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. `FieldDef.ShowToPlayer` and the key `creator.showToPlayer` no longer exist.

Background: the flag is authored in the creator and stored in the model, but **no renderer reads it and the backend masks nothing by it**. It promises a hiding that does not happen. Stored documents keep the `showToPlayer` bson key; Mongo ignores unknown keys on unmarshal, so no migration runs.

- [ ] **Step 1: Prove the flag has no consumers**

```bash
cd /Users/mateuszprocner/priv/warhammer-battle-helper
grep -rni "showtoplayer" warhammer-battle-helper-front/src warhammer-battle-helper-backend --include="*.js" --include="*.jsx" --include="*.go" --include="*.json"
```

Expected hits, and nothing else: `TemplateBuilder.jsx:128`, `TemplateBuilder.jsx:820`, both `translation.json` at key `creator.showToPlayer`, `SystemTemplate.go:215`, `SystemTemplate_test.go:20`, plus `token.showToPlayers` in both locale files and `TokenRingChrome.jsx`. If any other file appears, stop and report — the flag is live after all and this task must not run.

- [ ] **Step 2: Remove the front-end switch**

In `TemplateBuilder.jsx`, delete from `makeDefaultField`:

```js
    showToPlayer: true,
```

and delete this block from `PropertyPanel`:

```jsx
      <FormControlLabel control={<Switch checked={!!field.showToPlayer} onChange={e => up({ showToPlayer: e.target.checked })} size="small" />}
        label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.9rem' }}>{t('creator.showToPlayer')}</Typography>} sx={{ mb: 0.5 }} />
```

- [ ] **Step 3: Remove the translations**

Delete the line `"showToPlayer": "Show to player",` from `src/locales/en/translation.json` and `"showToPlayer": "Pokaż graczowi",` from `src/locales/pl/translation.json`. Both sit inside the `"creator"` object, around line 1403.

**Do not touch** `"showToPlayers"` near line 11 — that is `token.showToPlayers`, the token visibility feature, which works and is unrelated.

- [ ] **Step 4: Remove the backend field**

In `SystemTemplate.go`, delete:

```go
	ShowToPlayer       bool           `bson:"showToPlayer" json:"showToPlayer"`
```

In `SystemTemplate_test.go:20`, delete the line `ShowToPlayer: true,` from the struct literal.

- [ ] **Step 5: Verify both stacks build and test clean**

```bash
cd warhammer-battle-helper-backend && go test ./...
cd ../warhammer-battle-helper-front && CI=true npm test -- --watchAll=false
```

Expected: Go green. Front green except the known `App.test.js` axios ESM failure.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: FEATURE-211 drop the dead showToPlayer field flag

The creator wrote it and the model stored it, but no renderer ever read it and
the backend masked nothing by it, so it promised a hiding that never happened."
```

---

### Task 4: Make the front-end consumers recursive

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (`findDuplicateKeys` at `:1124`, `numberFields` at `:1466`)
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx` (`collectSkillOptions` at `:34`, `attrByKey` at `:182`)
- Modify: `warhammer-battle-helper-front/src/components/creator/TokenDisplayBuilder.jsx:85`
- Test: `warhammer-battle-helper-front/src/utils/templateSections.test.js` (extend)

**Interfaces:**
- Consumes: `walkFields(sections, fn)` from Task 1.
- Produces: nothing new; the four call sites now see fields at any depth.

These changes are safe on today's flat data — `walkFields` on a template with no nested sections visits exactly the same fields in the same order.

- [ ] **Step 1: Write the failing test**

Append to `warhammer-battle-helper-front/src/utils/templateSections.test.js`:

```js
describe('walkFields as the shared traversal', () => {
  test('finds a skill_table nested two levels down', () => {
    const tree = [{ id: 'sec_a', title: '', columns: 1, fields: [
      { key: 'sec_b', type: SECTION_TYPE, section: { id: 'sec_b', title: '', columns: 1, fields: [
        { key: 'st_1', type: 'skill_table', skills: [{ id: 'opt_1', label: 'Skradanie' }] },
      ] } },
    ] }];
    const found = [];
    walkFields(tree, f => { if (f.type === 'skill_table') found.push(f.key); });
    expect(found).toEqual(['st_1']);
  });

  test('is a no-op traversal for an empty or missing section list', () => {
    const seen = [];
    walkFields(undefined, f => seen.push(f));
    walkFields([], f => seen.push(f));
    expect(seen).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it passes already**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=templateSections
```

Expected: PASS — `walkFields` from Task 1 already covers this. These two cases lock in the contract the four call sites now depend on; if either fails, fix `walkFields` before touching the call sites.

- [ ] **Step 3: Rewrite `findDuplicateKeys`**

In `TemplateBuilder.jsx`, add to the imports (Task 6 extends this line — importing `SECTION_TYPE` now would trip `no-unused-vars`):

```js
import { walkFields } from '../../utils/templateSections';
```

Replace the whole `findDuplicateKeys` function:

```js
function findDuplicateKeys(sections) {
  const seen = {};
  const dupes = new Set();
  walkFields(sections, (field) => {
    if (seen[field.key]) dupes.add(field.key);
    else seen[field.key] = true;
  });
  return dupes;
}
```

- [ ] **Step 4: Rewrite `numberFields`**

Replace, inside `TemplateBuilder`:

```js
  const numberFields = sections.flatMap(s => s.fields).filter(f => f.type === 'attr');
```

with:

```js
  // Attribute list offered to formula builders — every attr field, at any nesting depth.
  const numberFields = useMemo(() => {
    const out = [];
    walkFields(sections, (f) => { if (f.type === 'attr') out.push(f); });
    return out;
  }, [sections]);
```

Add `useMemo` to the existing `react` import if it is not there yet.

- [ ] **Step 5: Rewrite `collectSkillOptions` and `attrByKey`**

In `CustomSheetBody.jsx`, add to the imports:

```js
import { walkFields } from '../../utils/templateSections';
```

Replace the two nested `for` loops inside `collectSkillOptions` with a single traversal — keep the body and the comment above the function unchanged:

```js
  walkFields(sections, (f) => {
    if (f.type === 'skill_table') {
      for (const opt of (f.skills || [])) {
        if (opt.label) push(`${f.key}.${opt.id}`, opt.label);
      }
    } else if (f.type === 'skill_tree' && f.tree) {
      const walk = (node, prefix) => {
        const path = prefix ? `${prefix}.${node.key}` : node.key;
        push(path, node.label);
        (node.children || []).forEach(ch => walk(ch, path));
      };
      (f.tree.children || []).forEach(ch => walk(ch, f.key));
    }
  });
```

Replace `attrByKey`:

```js
  const attrByKey = useMemo(() => {
    const out = {};
    walkFields(sections, (f) => { if (f.type === 'attr') out[f.key] = f; });
    return out;
  }, [sections]);
```

Add `useMemo` to the `react` import of that file if missing.

- [ ] **Step 6: Rewrite the token-display field picker**

In `TokenDisplayBuilder.jsx`, add to the imports:

```js
import { walkFields } from '../../utils/templateSections';
```

Replace the two nested `for` loops in the `fields` memo with:

```js
    walkFields(sections, (f) => {
      // Custom attributes are stored as { base, advances, current } — bind to .current.
      if (f.type === 'attr') out.push({ key: `attributes.${f.key}.current`, label: f.abbr || f.label, category: 'attribute' });
      else if (f.type === 'number') out.push({ key: `numbers.${f.key}`, label: f.abbr || f.label, category: 'number' });
      else if (f.type === 'progress') out.push({ key: `progress.${f.key}.current`, label: f.abbr || f.label, category: 'progress', progressMaxKey: `progress.${f.key}.max` });
    });
```

- [ ] **Step 7: Run the whole front suite**

```bash
CI=true npm test -- --watchAll=false
```

Expected: green except the known `App.test.js` axios ESM failure. The existing `CustomSheetBody.smoke.test.jsx`, `CustomSheetBody.skillTree.test.jsx` and `CharacterDetails.*` suites must all still pass — they are the regression net proving flat templates behave identically.

- [ ] **Step 8: Commit**

```bash
git add warhammer-battle-helper-front/src
git commit -m "refactor: FEATURE-211 route template field traversals through walkFields"
```

---

### Task 5: Render nested sections on the character sheet

**Files:**
- Modify: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.jsx:458` (`renderField`) and `:940-952` (the section list)
- Modify: `warhammer-battle-helper-front/src/style.css` (after `.custom-sheet__fields--6-col`, around line 7752)
- Test: `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.nestedSections.test.jsx` (new)

**Interfaces:**
- Consumes: `SECTION_TYPE` from Task 1.
- Produces: CSS classes `custom-sheet__section--nested`, `custom-sheet__section-heading--nested`.

- [ ] **Step 1: Write the failing test**

Create `warhammer-battle-helper-front/src/systems/custom/CustomSheetBody.nestedSections.test.jsx`:

```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

const sections = [
  { id: 'sec_root', title: 'Ekwipunek', columns: 3, fields: [
    { key: 'num_gold', type: 'number', label: 'Złoto' },
    { key: 'sec_weapons', type: 'section', label: '', section: {
      id: 'sec_weapons', title: 'Broń', columns: 2, fields: [
        { key: 'txt_main', type: 'text_short', label: 'Główna' },
        { key: 'sec_ammo', type: 'section', label: '', section: {
          id: 'sec_ammo', title: 'Amunicja', columns: 1, fields: [
            { key: 'num_arrows', type: 'number', label: 'Strzały' },
          ],
        } },
      ],
    } },
  ] },
];

describe('CustomSheetBody nested sections', () => {
  test('renders headings of every nesting level', () => {
    render(<CustomSheetBody sections={sections} />);
    expect(screen.getByText('Ekwipunek')).toBeInTheDocument();
    expect(screen.getByText('Broń')).toBeInTheDocument();
    expect(screen.getByText('Amunicja')).toBeInTheDocument();
  });

  test('renders a field three levels deep', () => {
    render(<CustomSheetBody sections={sections} />);
    expect(screen.getByText('Strzały')).toBeInTheDocument();
  });

  test('marks nested sections with the nested modifier and leaves the root plain', () => {
    const { container } = render(<CustomSheetBody sections={sections} />);
    const root = container.querySelector('.custom-sheet__section:not(.custom-sheet__section--nested)');
    expect(root).toBeInTheDocument();
    expect(container.querySelectorAll('.custom-sheet__section--nested')).toHaveLength(2);
  });

  test('gives each nested section its own column class', () => {
    const { container } = render(<CustomSheetBody sections={sections} />);
    expect(container.querySelector('.custom-sheet__fields--3-col')).toBeInTheDocument();
    expect(container.querySelector('.custom-sheet__fields--2-col')).toBeInTheDocument();
    expect(container.querySelector('.custom-sheet__fields--1-col')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody.nestedSections
```

Expected: FAIL — `Unable to find an element with the text: Broń`; `renderField` returns `null` for an unknown type.

- [ ] **Step 3: Implement the recursive renderer**

In `CustomSheetBody.jsx`, extend the import added in Task 4:

```js
import { SECTION_TYPE, walkFields } from '../../utils/templateSections';
```

Add a `case` to the `switch` inside `renderField`, directly above `default:`:

```jsx
      case SECTION_TYPE:
        return field.section ? renderSection(field.section, true) : null;
```

Add `renderSection` immediately after `renderField` (it must be defined before the `return`, and it calls `renderField`, which closes over it — both are `const` arrow functions in the same scope, so declare `renderSection` after `renderField` and never call either during render of the other's definition):

```jsx
  // renderSection draws one section and recurses through renderField into nested ones.
  // `nested` is a boolean rather than a depth number on purpose: the styling has exactly two
  // states (root and nested), and depth is unbounded, so a depth-indexed class would need an
  // arbitrary cap that the model does not have.
  const renderSection = (section, nested) => (
    <div
      key={section.id}
      className={`custom-sheet__section${nested ? ' custom-sheet__section--nested' : ''}`}
    >
      {section.title && (
        <div className={`custom-sheet__section-heading${nested ? ' custom-sheet__section-heading--nested' : ''}`}>
          {section.title}
        </div>
      )}
      <div className={`custom-sheet__fields custom-sheet__fields--${section.columns || 1}-col`}>
        {(section.fields || []).map(renderField)}
      </div>
    </div>
  );
```

Replace the section list in the `return` with:

```jsx
      <div className="custom-sheet__sections">
        {(sections || []).map(section => renderSection(section, false))}
      </div>
```

- [ ] **Step 4: Add the two CSS blocks**

In `src/style.css`, right after `.custom-sheet__fields--6-col`:

```css
/* ── Nested sections (FEATURE-211) ── */

/* A nested section sits in ONE cell of its parent grid, so min-width:0 is load-bearing:
   a grid item defaults to min-width:auto and its widest child (a long skill name, a weapons
   table) would push the cell past the fraction the parent assigned it. The parent's
   minmax(0, 1fr) protects the grid TRACKS, not the item inside the cell. */
.custom-sheet__section--nested {
    min-width: 0;
    background: rgba(255, 249, 240, 0.5);
    border: 1px solid #c4a882;
    border-radius: 6px;
    padding: 8px 10px;
    margin: 0;
}

.custom-sheet__section-heading--nested {
    font-size: 0.85rem;
    color: #7a5c42;
    margin-bottom: 6px;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=CustomSheetBody
```

Expected: the new file PASSES and `CustomSheetBody.smoke.test.jsx` plus `CustomSheetBody.skillTree.test.jsx` stay green.

- [ ] **Step 6: Commit**

```bash
git add warhammer-battle-helper-front/src
git commit -m "feat: FEATURE-211 render nested sections on the custom character sheet"
```

---

### Task 6: Creator — section component, path selection, recursive canvas

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (field types, palette, state, section/field operations, `SectionCanvas`, `SectionPropertyPanel`, `PropertyPanel` dispatch)
- Modify: `warhammer-battle-helper-front/src/style.css` (creator canvas nested styles)
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`, `src/locales/pl/translation.json`

**Interfaces:**
- Consumes: `SECTION_TYPE`, `nodeAt`, `locate`, `updateAtPath`, `insertAtPath`, `removeAtPath`, `moveNode`, `duplicateNodeAtPath`, `childrenOf`, `nodeId` from Task 1.
- Produces: `selected` is now `number[] | null`; `addingToPath` is now `number[] | null`; `SectionCanvas` takes `{ section, path, siblingCount, ... }`.

This is the largest task; DnD stays untouched here and is rewritten in Task 7. Between the two tasks drag & drop is broken for nested nodes — that is expected and is why Task 7 follows immediately.

- [ ] **Step 1: Register the section field type**

In `TemplateBuilder.jsx`, add the icon import next to the others:

```js
import ViewQuiltIcon from '@mui/icons-material/ViewQuilt';
```

Add to `FIELD_TYPES`, as the **first** entry:

```js
  { type: 'section',     labelKey: 'creator.fieldType.section',     icon: <ViewQuiltIcon fontSize="small" />,  desc: 'creator.fieldType.sectionDesc' },
```

Add to `PALETTE_GROUPS`, as the **first** group:

```js
  { labelKey: 'creator.paletteGroupLayout', types: ['section'] },
```

Extend `makeDefaultField` — insert before the final `return base;`:

```js
  // A section field wraps a whole SectionDef. section.id mirrors the field key so DnD,
  // selection and React keys all address the node by one value.
  if (type === 'section') return { ...base, section: { id: base.key, title: '', columns: 3, fields: [] } };
```

- [ ] **Step 2: Add the translation keys**

In `src/locales/en/translation.json`, inside `"creator"`:

```json
    "paletteGroupLayout": "Layout",
```

and inside `"creator"."fieldType"`:

```json
      "section": "Section",
      "sectionDesc": "A titled group with its own columns; takes one cell of the parent grid",
```

In `src/locales/pl/translation.json`, at the same places:

```json
    "paletteGroupLayout": "Układ",
```

```json
      "section": "Sekcja",
      "sectionDesc": "Nazwana grupa z własnymi kolumnami; zajmuje jedną komórkę siatki rodzica",
```

- [ ] **Step 3: Switch the component state to paths**

Replace the two state declarations:

```js
  const [selected,    setSelected]    = useState(null); // { sectionIdx, fieldIdx: number|null }
  const [addingToSection, setAddingToSection] = useState(null); // sectionIdx | null
```

with:

```js
  // selected is a PATH: [2] = third root section, [2,0] = its first child (field or
  // subsection), [2,0,1] = a child of that subsection. null = nothing selected.
  const [selected,    setSelected]    = useState(null);
  const [addingToPath, setAddingToPath] = useState(null); // path of the section whose "add field" list is open
```

Update the reset in the `useEffect` keyed on `template?.id`: `setAddingToSection(null)` becomes `setAddingToPath(null)`.

- [ ] **Step 4: Replace the section and field operations**

Add to the imports:

```js
import {
  SECTION_TYPE, nodeAt, locate, childrenOf,
  updateAtPath, insertAtPath, removeAtPath, duplicateNodeAtPath, walkFields,
} from '../../utils/templateSections';
```

Replace the whole block from `// ── Section operations ─` through the end of `duplicateField` with:

```js
  // ── Tree operations ────────────────────────────────────────────────────────
  //
  // Every operation below is "resolve a path, hand it to a pure helper, save". The tree
  // manipulation lives in utils/templateSections.js so it can be tested without a DOM.

  const commit = (next, nextSelected) => {
    setSections(next);
    if (nextSelected !== undefined) setSelected(nextSelected);
    triggerSave(next, name);
  };

  // containerPathFor answers "where would a new node land". A selected section takes it as a
  // child; a selected field takes it as a sibling; with nothing selected it goes to the last
  // root section. Returns null when the template has no sections at all.
  const containerPathFor = (path) => {
    if (path === null) return sections.length > 0 ? [sections.length - 1] : null;
    const node = nodeAt(sections, path);
    if (path.length === 1 || (node && node.type === SECTION_TYPE)) return path;
    return path.slice(0, -1);
  };

  const addSection = () => {
    const newSection = makeDefaultSection();
    const next = [...sections, newSection];
    commit(next, [next.length - 1]);
  };

  // addNode appends a field or a subsection to the container implied by the current
  // selection. With an empty template there is no container yet, so the click creates the
  // first root section instead — which is exactly what a "Section" click wanted anyway.
  const addNode = (type) => {
    const parentPath = containerPathFor(selected);
    if (parentPath === null) return addSection();
    const node = makeDefaultField(type);
    const count = (childrenOf(nodeAt(sections, parentPath)) || []).length;
    const next = insertAtPath(sections, parentPath, count, node);
    setAddingToPath(null);
    commit(next, [...parentPath, count]);
  };

  // addNodeTo is the in-canvas "add field" list: the container is explicit, not inferred.
  const addNodeTo = (parentPath, type) => {
    const node = makeDefaultField(type);
    const count = (childrenOf(nodeAt(sections, parentPath)) || []).length;
    const next = insertAtPath(sections, parentPath, count, node);
    setAddingToPath(null);
    commit(next, [...parentPath, count]);
  };

  const updateNode = (path, patch) => commit(updateAtPath(sections, path, patch));

  const removeNode = (path) => commit(removeAtPath(sections, path), null);

  const moveWithinParent = (path, dir) => {
    const found = locate(sections, path);
    if (!found) return;
    const target = found.index + dir;
    if (target < 0 || target >= found.siblings.length) return;
    const parentPath = path.slice(0, -1);
    // Remove then insert, so the pure helpers stay the only writers of the tree.
    const next = insertAtPath(removeAtPath(sections, path), parentPath, target, found.node);
    commit(next, [...parentPath, target]);
  };

  const duplicateNode = (path) => {
    const next = duplicateNodeAtPath(sections, path, {
      mint: genId,
      copySuffix: t('creator.copySuffix'),
    });
    // The copy lands directly after the original; keep the panel on whatever was selected,
    // shifting it when the insert pushed it down inside the same list.
    let nextSelected = selected;
    if (selected && selected.length === path.length
        && path.slice(0, -1).every((v, i) => selected[i] === v)
        && selected[selected.length - 1] > path[path.length - 1]) {
      nextSelected = [...selected];
      nextSelected[nextSelected.length - 1] += 1;
    }
    commit(next, nextSelected);
  };
```

Remove the now-unused `duplicateFieldInSections` import and delete `src/utils/templateFields.js` together with `src/utils/templateFields.test.js` — `duplicateNodeAtPath` replaces it and leaving a second, two-level-only duplicator invites the wrong one being called.

- [ ] **Step 5: Update the derived values and the palette**

Replace the derived selection values:

```js
  const selectedNode = selected !== null ? nodeAt(sections, selected) : null;
  const selectedIsSection = selected !== null
    && (selected.length === 1 || selectedNode?.type === SECTION_TYPE);
  const selectedSectionDef = selectedIsSection
    ? (selected.length === 1 ? selectedNode : selectedNode?.section)
    : null;
  const selectedSiblingCount = selected !== null
    ? (locate(sections, selected)?.siblings.length ?? 0)
    : 0;

  const totalFieldCount = (() => {
    let n = 0;
    walkFields(sections, () => { n += 1; });
    return n;
  })();
```

Replace the palette hint:

```jsx
            {selected !== null ? (
              <div className="creator__palette-hint">
                → {(() => {
                  const parentPath = containerPathFor(selected);
                  if (parentPath === null) return t('creator.sectionUnnamed');
                  const parent = nodeAt(sections, parentPath);
                  const def = parentPath.length === 1 ? parent : parent?.section;
                  return def?.title || t('creator.sectionUnnamed');
                })()}
              </div>
            ) : sections.length > 0 ? (
```

Replace the palette card `onClick` with:

```jsx
                      onClick={() => addNode(ft.type)}
```

- [ ] **Step 6: Make `SectionCanvas` recursive**

Replace the whole `SectionCanvas` component with:

```jsx
function SectionCanvas({
  section, path, siblingCount, selected,
  onSelect, onUpdate, onRemove, onMove, onDuplicate,
  onAddField, addingToPath, onToggleAdding, duplicateKeys, nested,
}) {
  const { t } = useTranslation();
  const id = section.id;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const dndStyle = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const isActive = samePathArr(selected, path);
  const cols = section.columns || 3;
  const isAddingHere = samePathArr(addingToPath, path);

  const childIds = section.fields.length > 0
    ? section.fields.map(f => f.key)
    : [`__drop__${section.id}`];

  return (
    <div
      ref={setNodeRef}
      style={dndStyle}
      className={`creator__section${isActive ? ' creator__section--active' : ''}${nested ? ' creator__section--nested' : ''}`}
      onClick={e => { e.stopPropagation(); onSelect(path); }}
    >
      <div className="creator__section-header">
        <span className="creator__section-drag" {...attributes} {...listeners}><DragHandleIcon style={{ fontSize: 16 }} /></span>
        <span className="creator__section-title-label">
          {section.title || <em style={{ opacity: 0.45 }}>{t('creator.sectionNoName')}</em>}
        </span>
        <span className="creator__section-cols-badge">{cols} {t('creator.colSuffix')}</span>
        <div className="creator__section-actions">
          <button className="creator__section-action-btn" onClick={e => { e.stopPropagation(); onMove(path, -1); }} disabled={path[path.length - 1] === 0} title={t('creator.sectionMoveUpShort')}>
            <ArrowUpwardIcon style={{ fontSize: 13 }} />
          </button>
          <button className="creator__section-action-btn" onClick={e => { e.stopPropagation(); onMove(path, +1); }} disabled={path[path.length - 1] === siblingCount - 1} title={t('creator.sectionMoveDownShort')}>
            <ArrowDownwardIcon style={{ fontSize: 13 }} />
          </button>
          <button className="creator__section-action-btn" onClick={e => { e.stopPropagation(); onDuplicate(path); }} title={t('creator.fieldDuplicate')}>
            <ContentCopyIcon style={{ fontSize: 13 }} />
          </button>
          <button className="creator__section-action-btn creator__section-action-btn--danger" onClick={e => { e.stopPropagation(); onRemove(path); }} title={t('creator.sectionDelete')}>
            <DeleteIcon style={{ fontSize: 13 }} />
          </button>
        </div>
      </div>

      <div className="creator__section-body">
        <SortableContext items={childIds} strategy={rectSortingStrategy}>
          <div className={`creator__fields-grid creator__fields-grid--${cols}`}>
            {section.fields.length > 0
              ? section.fields.map((child, i) => {
                  const childPath = [...path, i];
                  return child.type === SECTION_TYPE && child.section ? (
                    <SectionCanvas
                      key={child.key}
                      section={child.section}
                      path={childPath}
                      siblingCount={section.fields.length}
                      selected={selected}
                      onSelect={onSelect}
                      onUpdate={onUpdate}
                      onRemove={onRemove}
                      onMove={onMove}
                      onDuplicate={onDuplicate}
                      onAddField={onAddField}
                      addingToPath={addingToPath}
                      onToggleAdding={onToggleAdding}
                      duplicateKeys={duplicateKeys}
                      nested
                    />
                  ) : (
                    <FieldCard
                      key={child.key}
                      id={child.key}
                      field={child}
                      isSelected={samePathArr(selected, childPath)}
                      isDuplicateKey={duplicateKeys.has(child.key)}
                      onClick={() => onSelect(childPath)}
                      onRemove={() => onRemove(childPath)}
                      onDuplicate={() => onDuplicate(childPath)}
                      onMoveUp={() => onMove(childPath, -1)}
                      onMoveDown={() => onMove(childPath, +1)}
                      isFirst={i === 0}
                      isLast={i === section.fields.length - 1}
                    />
                  );
                })
              : <EmptyDropZone sectionId={section.id} />}
          </div>
        </SortableContext>

        {!isAddingHere && (
          <button
            className="creator__add-field-btn"
            onClick={e => { e.stopPropagation(); onToggleAdding(path); }}
          >
            <AddIcon style={{ fontSize: 14 }} /> {t('creator.addField')}
          </button>
        )}
        {isAddingHere && (
          <div className="creator__add-field-menu">
            {FIELD_TYPES.map(ft => (
              <button
                key={ft.type}
                className="creator__add-field-opt"
                onClick={e => { e.stopPropagation(); onAddField(path, ft.type); }}
              >
                {ft.icon} {t(ft.labelKey, { defaultValue: ft.type })}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

Add this helper next to the other module-level helpers in the same file:

```js
// samePathArr compares two selection paths; either may be null.
function samePathArr(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => b[i] === v);
}
```

**Before writing this component, open the current `SectionCanvas` (`TemplateBuilder.jsx:963`) and copy the exact class names and button markup of the header and the add-field menu from it.** The block above reproduces them from the current file, but if the `creator__add-field-btn` / `creator__add-field-menu` / `creator__add-field-opt` class names differ there, the file wins — keep the markup byte-identical apart from the path-based props.

- [ ] **Step 7: Update the canvas render and the property panels**

Replace the `sections.map(...)` in the canvas with:

```jsx
                  {sections.map((section, i) => (
                    <SectionCanvas
                      key={section.id}
                      section={section}
                      path={[i]}
                      siblingCount={sections.length}
                      selected={selected}
                      onSelect={setSelected}
                      onUpdate={updateNode}
                      onRemove={removeNode}
                      onMove={moveWithinParent}
                      onDuplicate={duplicateNode}
                      onAddField={addNodeTo}
                      addingToPath={addingToPath}
                      onToggleAdding={p => setAddingToPath(prev => (samePathArr(prev, p) ? null : p))}
                      duplicateKeys={duplicateKeys}
                      nested={false}
                    />
                  ))}
```

Also update the canvas-area click reset: `setAddingToSection(null)` becomes `setAddingToPath(null)`.

Replace the right-hand panel dispatch with:

```jsx
          {selected !== null && !selectedIsSection && selectedNode ? (
            <PropertyPanel
              field={selectedNode}
              onChange={patch => updateNode(selected, patch)}
              numberFields={numberFields}
              sections={sections}
            />
          ) : selectedSectionDef ? (
            <SectionPropertyPanel
              section={selectedSectionDef}
              onChange={patch => updateNode(selected, patch)}
              onDelete={() => removeNode(selected)}
              index={selected[selected.length - 1]}
              siblingCount={selectedSiblingCount}
              onMove={dir => moveWithinParent(selected, dir)}
            />
          ) : (
```

Change `SectionPropertyPanel`'s signature and the three places inside it that use the old props:

```jsx
function SectionPropertyPanel({ section, onChange, onDelete, index, siblingCount, onMove }) {
```

with the move buttons becoming `onClick={() => onMove(-1)}` / `onClick={() => onMove(+1)}` and `disabled={index === 0}` / `disabled={index === siblingCount - 1}`.

- [ ] **Step 8: Add the creator canvas CSS**

In `src/style.css`, after `.creator__fields-grid--6`:

```css
/* ── Nested sections in the creator canvas (FEATURE-211) ── */

/* Same min-width:0 reason as on the sheet: the creator grid is repeat(N, 1fr), whose items
   default to min-width:auto and would otherwise widen the cell past its fraction. */
.creator__section--nested {
    min-width: 0;
    margin-bottom: 0;
    background: rgba(255, 249, 240, 0.5);
    border-color: #c4a882;
}
```

Delete the dead rule while in this region — nothing references it:

```css
.creator__canvas-field--wide {
    grid-column: 1 / -1;
}
```

- [ ] **Step 9: Verify by hand and by suite**

```bash
CI=true npm test -- --watchAll=false
```

Expected: green except the known `App.test.js` failure, and no lint error about unused imports (`duplicateFieldInSections`, `rectSortingStrategy` if it moved).

Then open the creator in the running app and confirm, with drag & drop untouched for now:
1. Palette shows a "Układ / Layout" group with "Sekcja" first.
2. With a section selected, clicking "Sekcja" nests a subsection inside it; the palette hint names the target.
3. The in-section "dodaj pole" list shows "Sekcja" too and nests one.
4. A subsection's title, columns, move, duplicate and delete all work, and delete removes the subtree.
5. Subsection occupies one cell of the parent grid; a 3-column parent with a 2-column child gives quarter-ish cells.

- [ ] **Step 10: Commit**

```bash
git add warhammer-battle-helper-front/src
git commit -m "feat: FEATURE-211 nested sections in the template creator canvas"
```

---

### Task 7: Creator — path-based drag & drop across levels

**Files:**
- Modify: `warhammer-battle-helper-front/src/components/creator/TemplateBuilder.jsx` (`collisionDetection`, `handleDragStart`, `handleDragOver`, `handleDragEnd`, `handleDragCancel`, the root `SortableContext`)

**Interfaces:**
- Consumes: `indexNodes`, `moveNode`, `isAncestorPath` from Task 1 (added to the import line from Task 6).
- Produces: nothing; DnD is internal to the component.

The rewrite collapses today's two draggable classes (sections vertically, fields inside and between sections) into one: everything is a node, the root list is the container at path `[]`, and every section at every depth is a `SortableContext` over its children.

- [ ] **Step 1: Extend the imports**

```js
import { pointerWithin, rectIntersection } from '@dnd-kit/core';
```

and add to the `templateSections` import: `indexNodes`, `moveNode`, `isAncestorPath`.

- [ ] **Step 2: Replace `collisionDetection`**

```js
  // Nested containers overlap their parents geometrically, so closestCenter on a mix of
  // "child card" and "container" droppables keeps snapping to the parent box's centre and
  // dropping beside a subsection instead of inside it. pointerWithin answers "what is under
  // the cursor", which is the question a nested tree actually asks; rectIntersection only
  // covers the gap when the pointer leaves every droppable (e.g. dragging over the gutter).
  const collisionDetection = useCallback((args) => {
    const hits = pointerWithin(args);
    return hits.length > 0 ? hits : rectIntersection(args);
  }, []);
```

- [ ] **Step 3: Replace the drag handlers**

```js
  // dropTargetOf translates a droppable id into "which list, at which index". The
  // __drop__<sectionId> sentinel marks an empty section; anything else is a node, and the
  // drop lands in that node's own list at its index.
  const dropTargetOf = (overId, index) => {
    if (overId.startsWith('__drop__')) {
      const sectionId = overId.slice('__drop__'.length);
      const path = index.get(sectionId);
      if (!path) return null;
      return { parentPath: path, idx: 0 };
    }
    const path = index.get(overId);
    if (!path) return null;
    return { parentPath: path.slice(0, -1), idx: path[path.length - 1] };
  };

  const handleDragStart = () => {
    originalSectionsRef.current = sectionsRef.current;
    clearTimeout(saveTimer.current);
  };

  const handleDragCancel = () => {
    if (originalSectionsRef.current) setSections(originalSectionsRef.current);
    originalSectionsRef.current = null;
  };

  // The live preview happens here, so the node visibly travels between containers while the
  // pointer moves. sectionsRef is written synchronously to choke the next onDragOver before
  // React re-renders — without it dnd-kit fires again against the stale tree and the node
  // ping-pongs between two lists.
  const handleDragOver = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const cur = sectionsRef.current;
    const index = indexNodes(cur);
    const fromPath = index.get(String(active.id));
    const target = dropTargetOf(String(over.id), index);
    if (!fromPath || !target) return;

    // Same list is pure reordering; leave it to onDragEnd so the preview does not thrash.
    const fromParent = fromPath.slice(0, -1);
    if (fromParent.length === target.parentPath.length
        && fromParent.every((v, i) => target.parentPath[i] === v)) return;

    if (isAncestorPath(fromPath, target.parentPath)) return; // dropping a section into itself

    const next = moveNode(cur, fromPath, target.parentPath, target.idx);
    if (next === cur) return;
    sectionsRef.current = next;
    setSections(next);
  };

  const handleDragEnd = ({ active, over }) => {
    originalSectionsRef.current = null;
    const cur = sectionsRef.current;
    if (!over || active.id === over.id) { triggerSave(cur, name); return; }

    const index = indexNodes(cur);
    const fromPath = index.get(String(active.id));
    const target = dropTargetOf(String(over.id), index);
    if (!fromPath || !target) { triggerSave(cur, name); return; }

    const next = moveNode(cur, fromPath, target.parentPath, target.idx);
    setSections(next);

    // Follow the dragged node with the selection so the property panel does not jump to a
    // stranger: its path changed, its id did not.
    const movedId = String(active.id);
    const newPath = indexNodes(next).get(movedId) || null;
    setSelected(newPath);
    triggerSave(next, name);
  };
```

- [ ] **Step 4: Keep the root list sortable**

The root `SortableContext` stays as it is (`items={sections.map(s => s.id)}`, `strategy={verticalListSortingStrategy}`) — root sections are the children of the container at path `[]`, and each nested section brings its own `SortableContext` from Task 6.

- [ ] **Step 5: Verify the pure move logic still holds**

```bash
CI=true npm test -- --watchAll=false --testPathPattern=templateSections
```

Expected: PASS. The move semantics, including the cycle guard, are covered by Task 1's tests; jsdom cannot drive dnd-kit (`window.PointerEvent` does not exist and `getBoundingClientRect` returns zeros), so the DnD wiring itself is verified by hand.

- [ ] **Step 6: Verify by hand in the running app**

In the creator, with a template holding at least two root sections and one two-level subsection:
1. Drag a field from a root section into a subsection two levels down — it lands there.
2. Drag a field out of a subsection back to a root section.
3. Drag a whole subsection into another section; its children travel with it.
4. Drag a subsection onto one of its own descendants — nothing happens, the tree stays intact.
4b. Drag a root section into another section — it becomes a subsection, title and fields intact.
4c. Drag a subsection out to the root list — it becomes a root section, title and fields intact.
4d. Drag a plain field onto the gap between two root sections — nothing happens (a field cannot be a root section).
5. Reorder fields inside one section — order changes, nothing escapes the section.
6. Drop onto an empty section — the node lands in it.
7. After each drop the right-hand panel still shows the node you dragged.

- [ ] **Step 7: Run the whole suite and commit**

```bash
CI=true npm test -- --watchAll=false
cd ../warhammer-battle-helper-backend && go test ./...
```

Expected: front green except the known `App.test.js` failure; Go green.

```bash
git add warhammer-battle-helper-front/src
git commit -m "feat: FEATURE-211 drag and drop template nodes across nesting levels"
```

---

## Verification checklist

Before calling the feature done:

- [ ] `CI=true npm test -- --watchAll=false` — green except `App.test.js` (axios ESM, known baseline)
- [ ] `go test ./...` — green
- [ ] A template with three nesting levels saves, reloads after closing the creator, and renders on a real character sheet
- [ ] A field inside a subsection can be rolled from the sheet and the log shows its label, not its raw key
- [ ] A character created from a template with a default inside a subsection starts with that value
- [ ] Duplicating a subsection produces fields whose values are independent of the original on the same character
- [ ] `grep -rni "showtoplayer"` over both stacks returns only `token.showToPlayers` hits
