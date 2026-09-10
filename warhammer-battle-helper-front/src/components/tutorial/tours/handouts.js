// .handouts-tab__empty ZASTĘPUJE .handouts-tab__list (HandoutsTab.jsx) — inaczej niż
// w notes/files/scenes, gdzie pusty stan siedzi w środku listy. Kolejność "pusty pierwszy"
// obsługuje oba układy.
// .handouts-tab__header-actions renderuje się tylko dla MG (HandoutTabHeader.jsx),
// więc krok o tworzeniu wypada graczowi sam, bez deklaracji roles.
const handouts = {
  id: 'handouts',
  steps: [
    { id: 'list', target: ['.handouts-tab__empty', '.handouts-tab__list'], placement: 'left', variants: ['byTarget', 'byRole'] },
    { id: 'create', target: '.handouts-tab__header-actions', placement: 'left' },
  ],
};

export default handouts;
