// The creator's Sheet tab. The canvas step varies by which anchor is live: the empty-canvas
// prompt (index 0) or the sheet itself (index 1). The section and field steps need a node on the
// canvas and drop out on an empty sheet. Outlines, not the hover-gated chrome pills, are the
// anchors: a pill is invisible until hovered.
const creatorSheet = {
  id: 'creatorSheet',
  steps: [
    { id: 'palette', target: '.creator__palette', placement: 'right' },
    { id: 'canvas', target: ['.creator__canvas-empty', '.creator__sheet-stack'], placement: 'auto', variants: ['byTarget'] },
    { id: 'section', target: '.creator__chrome-outline--section', placement: 'auto' },
    { id: 'field', target: '.creator__chrome-outline--field', placement: 'auto' },
    { id: 'preview', target: '.creator__preview-toggle', placement: 'bottom' },
    { id: 'status', target: '.creator__status', placement: 'bottom' },
    { id: 'help', target: '.creator__tour-btn', placement: 'bottom' },
  ],
};

export default creatorSheet;
