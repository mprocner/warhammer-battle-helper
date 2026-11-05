// .scenes-tab__empty jest ZAGNIEŻDŻONY w .scenes-tab__list (ScenesTab.jsx).
// .scenes-tab__settings-title pojawia się dopiero po wybraniu sceny (ScenesTab.jsx).
// .scenes-tab__btn is shared with the small buttons in scene settings — the header button has its own anchor.
const scenes = {
  id: 'scenes',
  steps: [
    { id: 'list', target: ['.scenes-tab__empty', '.scenes-tab__list'], placement: 'left', variants: ['byTarget'] },
    { id: 'create', target: '.scenes-tab__create-btn', placement: 'left' },
    { id: 'settings', target: '.scenes-tab__settings-title', placement: 'left' },
  ],
};

export default scenes;
