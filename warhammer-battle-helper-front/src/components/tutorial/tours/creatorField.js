// The property popup of one field or section. The head step describes the edited type and has a
// text per type (no fallback). Each group step anchors on its PropsGroup id
// (creator__props-group--<id>) and has general text with optional per-type sharpening
// (variantFallback). Groups a type does not have drop out by themselves; the section panel has no
// groups and gets its own three steps instead.
const group = (id) => ({
  id, target: `.creator__props-group--${id}`, placement: 'auto', variants: ['byFieldType'], variantFallback: true,
});

const creatorField = {
  id: 'creatorField',
  steps: [
    { id: 'head', target: '.creator__props-title', placement: 'bottom', variants: ['byFieldType'] },
    group('display'),
    group('basics'),
    group('values'),
    group('attrRows'),
    group('formula'),
    group('content'),
    group('roll'),
    { id: 'sectionTitle', target: '.creator__section-title-input', placement: 'auto' },
    { id: 'sectionColumns', target: '.creator__layout-options', placement: 'auto' },
    { id: 'sectionActions', target: '.creator__props-danger', placement: 'auto' },
  ],
};

export default creatorField;
