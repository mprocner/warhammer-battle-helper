// The creator's General tab, top bar first, then its settings cards in screen order. A variant of
// a built-in system shows only the token card and no Sheet tab; steps whose anchor is absent
// drop out by themselves - the tabs step anchors on a nav modifier set only when both tabs exist.
const creatorGeneral = {
  id: 'creatorGeneral',
  steps: [
    { id: 'name', target: '.creator__name-input', placement: 'bottom' },
    { id: 'tabs', target: '.creator__tab-nav--two-tabs', placement: 'bottom' },
    { id: 'visibility', target: '.creator__settings-card--visibility', placement: 'auto' },
    { id: 'sheetWidth', target: '.creator__settings-card--sheet-width', placement: 'auto' },
    { id: 'dice', target: '.creator__settings-card--dice', placement: 'auto' },
    { id: 'modifier', target: '.creator__settings-card--modifier', placement: 'auto' },
    { id: 'token', target: '.creator__settings-card--token', placement: 'auto' },
    { id: 'help', target: '.creator__tour-btn', placement: 'bottom' },
  ],
};

export default creatorGeneral;
