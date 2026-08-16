/**
 * Duplicates one field of a creator template, inserting the copy directly after the
 * original inside the same section.
 *
 * The copy is a deep clone: the creator's editors rebuild arrays immutably today, but a
 * shallow spread would leave `columns` / `skills` / `presetWeapons` / `tree` shared with
 * the original, so the first imperative push added later would silently edit both fields.
 * The clone goes through JSON because the field is JSON-serialized on every autosave
 * anyway — a value JSON drops (Date, Map, undefined) cannot survive in this model.
 *
 * Only the top-level `key` is replaced. Nested ids stay verbatim: they are addressed as
 * `<fieldKey>.<optionId>` and the field key is already new, so the full address is unique.
 *
 * @param {Array} sections creator sections
 * @param {number} sectionIdx section holding the field to duplicate
 * @param {number} fieldIdx index of the field to duplicate
 * @param {{newKey: string, copySuffix: string}} options
 * @returns {Array} a new sections array, or the original one when the indexes miss
 */
export const duplicateFieldInSections = (sections, sectionIdx, fieldIdx, { newKey, copySuffix }) => {
  const section = sections?.[sectionIdx];
  const source = section?.fields?.[fieldIdx];
  if (!source) return sections;

  const copy = JSON.parse(JSON.stringify(source));
  copy.key = newKey;
  if (copy.label) copy.label = `${copy.label} ${copySuffix}`;

  const fields = [...section.fields];
  fields.splice(fieldIdx + 1, 0, copy);

  return sections.map((s, i) => (i === sectionIdx ? { ...s, fields } : s));
};

export default duplicateFieldInSections;
