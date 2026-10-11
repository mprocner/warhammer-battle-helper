// fieldRowSpan says how many rows of the section grid a field occupies (PLAYRPG-241).
//
// The unit is one text tile. A field of 2 is as tall as two text tiles plus the gap between
// them, which is what lets a GM stack two short fields beside one avatar. `null` means the
// field's height follows its content (tables, free images, nested sections): those cannot be
// quantised without measuring them, and the sheet deliberately does no layout measurement.
//
// The span is derived from the type alone, never stored on the template, so changing this
// table re-lays out every existing sheet and there is nothing to migrate.
const TWO_ROWS = new Set(['char_avatar', 'text_long']);
const ONE_ROW = new Set([
  'text_short', 'char_name', 'number', 'computed', 'progress', 'select', 'checkbox', 'label',
]);

export function fieldRowSpan(field) {
  if (!field) return null;
  // An attribute with advances shows base + advances beside its total; without them it is a
  // single number, as compact as any other value tile.
  if (field.type === 'attr') return field.hasAdvances ? 2 : 1;
  if (TWO_ROWS.has(field.type)) return 2;
  if (ONE_ROW.has(field.type)) return 1;
  return null;
}
