// Przycisk samouczka i te kotwice żyją w widoku listy; ekran konfiguracji rozgrywki
// (MinigameSetup.jsx) ma własny tytuł i celowo nie ma samouczka.
const minigames = {
  id: 'minigames',
  steps: [
    { id: 'list', target: '.minigame-list', placement: 'left' },
    { id: 'start', target: '.minigame-list__item', placement: 'left' },
  ],
};

export default minigames;
