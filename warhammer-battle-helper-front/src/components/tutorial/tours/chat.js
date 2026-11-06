// .log-window__list / .log-window__empty  — LogWindow.jsx
// .dice-controls__visibility-row          — log/DiceRollControls.jsx
// .dice-controls__my-rolls-toggle         — log/DiceRollControls.jsx
const chat = {
  id: 'chat',
  help: 'dice-and-chat#chat',
  steps: [
    { id: 'log', target: ['.log-window__empty', '.log-window__list'], placement: 'left', variants: ['byTarget'] },
    { id: 'dice', target: '.dice-controls__visibility-row', placement: 'left', variants: ['byRole'], help: 'dice-and-chat#who-sees-a-roll' },
    { id: 'myRolls', target: '.dice-controls__my-rolls-toggle', placement: 'left', help: 'dice-and-chat#statistics' },
  ],
};

export default chat;
