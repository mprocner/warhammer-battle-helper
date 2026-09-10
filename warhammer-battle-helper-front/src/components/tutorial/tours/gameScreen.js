// Kotwice to istniejące, unikalne klasy CSS ekranu gry — świadomie nie dokładamy
// atrybutów data-* do markupu. Gdy któraś klasa zostanie przemianowana, krok bez
// kotwicy po prostu wypadnie z samouczka (patrz engine/useGameTour), a nie
// wysypie ekranu.
//   .sidebar-top-section        components/common/ResizableSplitPane.jsx
//   .sidebar-bottom-section     components/common/ResizableSplitPane.jsx
//   .scene-selector             components/scene/SceneSelector.jsx        (tylko MG)
//   .window-bar                 components/WindowBar.jsx
//   .scene-viewport             components/scene/SceneViewport.jsx
//   .layer-selector             components/scene/LayerSelector.jsx        (tylko MG)
//   .drawing-toolbar            components/scene/DrawingToolbar.jsx
//   .right-panel__online-users  components/online-users/OnlineUsersBar.jsx
//   .right-panel__tabs-nav      components/panels/RightPanel.jsx
//   .dice-controls              components/log/DiceRollControls.jsx

const BOTH = ['gm', 'player'];

const gameScreen = {
  id: 'gameScreen',
  steps: [
    { id: 'characterCard', target: '.sidebar-top-section', roles: BOTH, placement: 'right', reveal: 'left' },
    { id: 'characterList', target: '.sidebar-bottom-section', roles: BOTH, placement: 'right', reveal: 'left' },
    { id: 'sceneSelector', target: '.scene-selector', roles: ['gm'], placement: 'bottom', reveal: 'top' },
    { id: 'windowBar', target: '.window-bar', roles: BOTH, placement: 'bottom', reveal: 'top' },
    { id: 'sceneControls', target: '.scene-viewport', roles: BOTH, placement: 'center', variants: ['byScheme'] },
    { id: 'layerSelector', target: '.layer-selector', roles: ['gm'], placement: 'left' },
    { id: 'drawingToolbar', target: '.drawing-toolbar', roles: BOTH, placement: 'left', variants: ['byRole'] },
    { id: 'onlineUsers', target: '.right-panel__online-users', roles: BOTH, placement: 'bottom' },
    { id: 'tabsNav', target: '.right-panel__tabs-nav', roles: BOTH, placement: 'left', reveal: 'right' },
    { id: 'diceControls', target: '.dice-controls', roles: BOTH, placement: 'left', reveal: 'right' },
  ],
};

export default gameScreen;
