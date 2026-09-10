// Kotwice to istniejące, unikalne klasy CSS ekranu gry — świadomie nie dokładamy
// atrybutów data-* do markupu. Gdy któraś klasa zostanie przemianowana, krok bez
// kotwicy po prostu wypadnie z samouczka (patrz useGameTour), a nie wysypie ekranu.
//   .sidebar-top-section        components/common/ResizableSplitPane.jsx:48
//   .sidebar-bottom-section     components/common/ResizableSplitPane.jsx:55
//   .scene-selector             components/scene/SceneSelector.jsx:113   (tylko MG)
//   .window-bar                 components/WindowBar.jsx:81
//   .scene-viewport             components/scene/SceneViewport.jsx:720
//   .layer-selector             components/scene/LayerSelector.jsx:24    (tylko MG)
//   .drawing-toolbar            components/scene/DrawingToolbar.jsx:80
//   .right-panel__online-users  components/online-users/OnlineUsersBar.jsx:29
//   .right-panel__tabs-nav      components/panels/RightPanel.jsx:213
//   .dice-controls              components/log/DiceRollControls.jsx:42

const BOTH = ['gm', 'player'];

export const TOUR_STEPS = [
  { id: 'characterCard', target: '.sidebar-top-section', roles: BOTH, placement: 'right', reveal: 'left' },
  { id: 'characterList', target: '.sidebar-bottom-section', roles: BOTH, placement: 'right', reveal: 'left' },
  { id: 'sceneSelector', target: '.scene-selector', roles: ['gm'], placement: 'bottom', reveal: 'top' },
  { id: 'windowBar', target: '.window-bar', roles: BOTH, placement: 'bottom', reveal: 'top' },
  { id: 'sceneControls', target: '.scene-viewport', roles: BOTH, placement: 'center' },
  { id: 'layerSelector', target: '.layer-selector', roles: ['gm'], placement: 'left' },
  { id: 'drawingToolbar', target: '.drawing-toolbar', roles: BOTH, placement: 'left' },
  { id: 'onlineUsers', target: '.right-panel__online-users', roles: BOTH, placement: 'bottom' },
  { id: 'tabsNav', target: '.right-panel__tabs-nav', roles: BOTH, placement: 'left', reveal: 'right' },
  { id: 'diceControls', target: '.dice-controls', roles: BOTH, placement: 'left', reveal: 'right' },
];

export const stepsForRole = (role) => TOUR_STEPS.filter(step => step.roles.includes(role));

export const titleKeyFor = (step) => `tutorial.steps.${step.id}.title`;

export const bodyKeyFor = (step, { controlScheme, role }) => {
  if (step.id === 'sceneControls') {
    return `tutorial.steps.sceneControls.body.${controlScheme === 'classic' ? 'classic' : 'modern'}`;
  }
  if (step.id === 'drawingToolbar') {
    return `tutorial.steps.drawingToolbar.body.${role}`;
  }
  return `tutorial.steps.${step.id}.body`;
};

const REVEAL_SATISFIED = {
  left: (panels) => !panels.leftHidden,
  right: (panels) => !panels.rightHidden,
  top: (panels) => !panels.topCollapsed,
};

export const isRevealSatisfied = (step, panels) =>
  step.reveal ? REVEAL_SATISFIED[step.reveal](panels) : true;
