// .players-tab__invite is the row layout shared by the invite link and the e-mail form, so each
// step anchors on its own class. .players-tab__list renders only for a non-empty list
// (PlayersTab.jsx), .players-tab__empty when nobody has joined yet.
const players = {
  id: 'players',
  help: 'for-game-masters#players',
  steps: [
    { id: 'inviteLink', target: '.players-tab__invite-link', placement: 'left', help: 'for-game-masters#invite-link' },
    { id: 'invite', target: '.players-tab__invite-email', placement: 'left' },
    { id: 'list', target: ['.players-tab__empty', '.players-tab__list'], placement: 'left', variants: ['byTarget'] },
    { id: 'kick', target: '.players-tab__kick-btn', placement: 'left' },
  ],
};

export default players;
