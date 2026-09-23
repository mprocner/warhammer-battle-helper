import React from 'react';
import { useTranslation } from 'react-i18next';
import { sectionOf, isContainer } from '../../utils/templateSections';

// Edit-only stand-ins for template nodes that draw nothing.
//
// A node with no visible content cannot be hovered, so it cannot be selected, dragged or edited —
// it falls out of the editor entirely. These stand-ins give it something to point at. They live
// HERE rather than in CustomSheetBody so the session's markup stays byte-for-byte what it has
// always been.
//
// Every condition reads a property the field definition really carries. An earlier version tested
// `node.rows` on a weapons table, which no field definition has — a table's rows are character
// data in values.weapons, which the creator never holds — so the branch fired for every table.
//
// "Draws nothing" is the only qualifying reason. A field with no label still renders its input,
// still has size and still takes the pointer, so it gets no placeholder; an earlier version gave
// one to every field, because makeDefaultField starts every type with label: ''.
//
// A skill tree counts as empty when its template children are empty. Its `tree.label` is never
// rendered, and the nodes a player adds live in the character's customSkillNodes, which the
// creator never holds — so a fresh tree draws an empty title and an empty container.
//
// These are never filled with sample values. Fake numbers would be indistinguishable from the
// real starting values the Go plugin assigns (plugin.go:83), and an attr field with a 1-10 range
// would get a value outside its own range or a silently clamped one — either way the GM would
// draw the wrong conclusion about a mechanism that does work.
function EditablePlaceholder({ node }) {
  const { t } = useTranslation();
  if (!node) return null;

  // Covers a root SectionDef and a `section` field wrapper alike: childrenOf normalises both
  // through sectionOf, so one branch answers for every section at every depth.
  if (isContainer(node)) {
    const def = sectionOf(node);
    return (def?.fields || []).length === 0
      ? <div className="creator__ph creator__ph--section">{t('creator.placeholderEmptySection')}</div>
      : null;
  }

  if (node.type === 'label' && !node.text) {
    return <div className="creator__ph creator__ph--inline">{t('creator.placeholderLabelText')}</div>;
  }

  if (node.type === 'weapons_table' && (node.columns || []).length === 0) {
    return <div className="creator__ph creator__ph--row" />;
  }

  if (node.type === 'skill_table' && (node.skills || []).length === 0) {
    return <div className="creator__ph creator__ph--row" />;
  }

  if (node.type === 'skill_tree' && (node.tree?.children || []).length === 0) {
    return <div className="creator__ph creator__ph--row" />;
  }

  return null;
}

export default EditablePlaceholder;
