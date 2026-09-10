// .players-tab__list renderuje się tylko przy niepustej liście (PlayersTab.jsx),
// a .players-tab__empty gdy nikt jeszcze nie dołączył.
const players = {
  id: 'players',
  steps: [
    { id: 'invite', target: '.players-tab__invite', placement: 'left' },
    { id: 'list', target: ['.players-tab__empty', '.players-tab__list'], placement: 'left', variants: ['byTarget'] },
    { id: 'kick', target: '.players-tab__kick-btn', placement: 'left' },
  ],
};

export default players;
