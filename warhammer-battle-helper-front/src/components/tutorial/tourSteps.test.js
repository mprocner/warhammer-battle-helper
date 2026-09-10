const fs = require('fs');
const path = require('path');

import {
  TOUR_STEPS,
  stepsForRole,
  titleKeyFor,
  bodyKeyFor,
  isRevealSatisfied,
} from './tourSteps';

const ALL_VISIBLE = { leftHidden: false, rightHidden: false, topCollapsed: false };

// Kotwice w TOUR_STEPS to gołe selektory CSS na istniejące klasy (patrz komentarz
// na górze tourSteps.js) — nie ma nic, co by je wiązało z markupem na poziomie
// kompilatora. Już raz przemianowanie klasy po cichu wyrzuciło krok z samouczka
// (patrz useGameTour). Ten test czyta całe źródło src/ i pilnuje, żeby każda
// klasa z target dalej istniała gdziekolwiek w drzewie.
// tourSteps.js jest wykluczony: to plik z definicjami target, więc każda
// klasa "istnieje" w nim trywialnie jako literał selektora — sprawdzenie
// musi trafić na prawdziwe użycie klasy w markupie/CSS, nie na jej własną
// deklarację.
const readAllSourceFiles = (dir, excludePath) => {
  let contents = '';
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (fullPath === excludePath) continue;
    if (entry.isDirectory()) {
      contents += readAllSourceFiles(fullPath, excludePath);
    } else if (/\.(js|jsx|css)$/.test(entry.name)) {
      contents += fs.readFileSync(fullPath, 'utf8');
    }
  }
  return contents;
};

describe('tourSteps', () => {
  it('walks the screen left to right, ending at the right panel', () => {
    expect(TOUR_STEPS.map(s => s.id)).toEqual([
      'characterCard', 'characterList', 'sceneSelector', 'windowBar', 'sceneControls',
      'layerSelector', 'drawingToolbar', 'onlineUsers', 'tabsNav', 'diceControls',
    ]);
  });

  it('gives the GM ten steps and the player eight', () => {
    expect(stepsForRole('gm')).toHaveLength(10);
    expect(stepsForRole('player')).toHaveLength(8);
  });

  it('hides the GM-only scene picker and layer picker from players', () => {
    const playerIds = stepsForRole('player').map(s => s.id);
    expect(playerIds).not.toContain('sceneSelector');
    expect(playerIds).not.toContain('layerSelector');
  });

  it('puts the layer step before the tool step, matching the on-screen stacking', () => {
    const ids = stepsForRole('gm').map(s => s.id);
    expect(ids.indexOf('layerSelector')).toBeLessThan(ids.indexOf('drawingToolbar'));
  });

  it('picks the scene control text that matches the active control scheme', () => {
    const step = TOUR_STEPS.find(s => s.id === 'sceneControls');
    expect(bodyKeyFor(step, { controlScheme: 'modern', role: 'gm' }))
      .toBe('tutorial.steps.sceneControls.body.modern');
    expect(bodyKeyFor(step, { controlScheme: 'classic', role: 'gm' }))
      .toBe('tutorial.steps.sceneControls.body.classic');
  });

  it('gives the GM and the player different tool descriptions', () => {
    const step = TOUR_STEPS.find(s => s.id === 'drawingToolbar');
    expect(bodyKeyFor(step, { controlScheme: 'modern', role: 'gm' }))
      .toBe('tutorial.steps.drawingToolbar.body.gm');
    expect(bodyKeyFor(step, { controlScheme: 'modern', role: 'player' }))
      .toBe('tutorial.steps.drawingToolbar.body.player');
  });

  it('derives plain keys for every other step', () => {
    const step = TOUR_STEPS.find(s => s.id === 'characterCard');
    expect(titleKeyFor(step)).toBe('tutorial.steps.characterCard.title');
    expect(bodyKeyFor(step, { controlScheme: 'modern', role: 'gm' }))
      .toBe('tutorial.steps.characterCard.body');
  });

  it('treats a step with no reveal requirement as always ready', () => {
    const step = TOUR_STEPS.find(s => s.id === 'sceneControls');
    expect(step.reveal).toBeUndefined();
    expect(isRevealSatisfied(step, { leftHidden: true, rightHidden: true, topCollapsed: true })).toBe(true);
  });

  it('blocks a step until the panel holding its anchor is open', () => {
    const tabs = TOUR_STEPS.find(s => s.id === 'tabsNav');
    expect(isRevealSatisfied(tabs, { ...ALL_VISIBLE, rightHidden: true })).toBe(false);
    expect(isRevealSatisfied(tabs, ALL_VISIBLE)).toBe(true);

    const card = TOUR_STEPS.find(s => s.id === 'characterCard');
    expect(isRevealSatisfied(card, { ...ALL_VISIBLE, leftHidden: true })).toBe(false);

    const bar = TOUR_STEPS.find(s => s.id === 'windowBar');
    expect(isRevealSatisfied(bar, { ...ALL_VISIBLE, topCollapsed: true })).toBe(false);
  });

  it('keeps every step target pointed at a class that still exists somewhere in src', () => {
    const srcDir = path.join(__dirname, '..', '..');
    const thisFile = path.join(__dirname, 'tourSteps.js');
    const source = readAllSourceFiles(srcDir, thisFile);

    TOUR_STEPS.forEach((step) => {
      const className = step.target.replace(/^\./, '');
      expect(source.includes(className)).toBe(true);
    });
  });
});
