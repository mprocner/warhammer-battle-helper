// .notes-tab__empty jest ZAGNIEŻDŻONY w .notes-tab__list (NotesTab.jsx),
// więc lista istnieje zawsze — pusty stan musi być pierwszy w liście kotwic.
// .notes-tab__filter-row renderuje się dopiero przy notes.length > 0 (NotesTab.jsx).
const notes = {
  id: 'notes',
  steps: [
    { id: 'list', target: ['.notes-tab__empty', '.notes-tab__list'], placement: 'left', variants: ['byTarget'] },
    { id: 'add', target: '.notes-tab__add-btn', placement: 'left' },
    { id: 'filter', target: '.notes-tab__filter-row', placement: 'left' },
  ],
};

export default notes;
