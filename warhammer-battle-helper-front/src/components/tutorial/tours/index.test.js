import fs from 'fs';
import path from 'path';
import { getTour, TOUR_IDS } from './index';
import { TAB_DEFS } from '../../panels/tabDefinitions';
import { VARIANT_AXES } from '../engine/stepResolution';

// Zakładka `general` celowo nie ma samouczka — to lista ustawień, gdzie każde pole
// ma już własną etykietę i opis.
const TABS_WITHOUT_TOUR = ['general'];

describe('registry covers the right panel', () => {
  it('has a tour for every tab that is meant to have one', () => {
    const expected = TAB_DEFS.map(d => d.id).filter(id => !TABS_WITHOUT_TOUR.includes(id));
    expected.forEach(id => expect(getTour(id)).not.toBeNull());
  });

  it('registers no tour for the tabs deliberately left out', () => {
    TABS_WITHOUT_TOUR.forEach(id => expect(getTour(id)).toBeNull());
  });

  it('registers exactly the game screen tour plus one per covered tab', () => {
    expect(TOUR_IDS.length).toBe(TAB_DEFS.length - TABS_WITHOUT_TOUR.length + 1);
  });
});

describe('tour registry', () => {
  it('serves the game screen tour', () => {
    const tour = getTour('gameScreen');
    expect(tour).not.toBeNull();
    expect(tour.id).toBe('gameScreen');
    expect(tour.steps.length).toBeGreaterThan(0);
  });

  it('returns null for an unknown id instead of throwing', () => {
    expect(getTour('nope')).toBeNull();
  });

  it('gives every registered tour a non-empty step list and an id matching its key', () => {
    TOUR_IDS.forEach(id => {
      const tour = getTour(id);
      expect(tour.id).toBe(id);
      expect(Array.isArray(tour.steps)).toBe(true);
      expect(tour.steps.length).toBeGreaterThan(0);
    });
  });

  it('gives every step an id and a target', () => {
    TOUR_IDS.forEach(id => {
      getTour(id).steps.forEach(step => {
        expect(typeof step.id).toBe('string');
        expect(step.target).toBeDefined();
      });
    });
  });

  // stepResolution.bodyKeyFor silently drops any axis it doesn't recognize
  // (see the comment there) so a typo in a tour's `variants` list no longer
  // crashes the render — but it also stops producing the variant suffix, so
  // the player just gets the wrong translation with no signal anything is
  // wrong. Catch the typo here, at registry level, instead.
  it('declares only variant axes the engine knows how to resolve', () => {
    const knownAxes = Object.keys(VARIANT_AXES);
    const unknown = [];
    TOUR_IDS.forEach(tourId => {
      getTour(tourId).steps.forEach(step => {
        (step.variants || []).forEach(axis => {
          if (!knownAxes.includes(axis)) unknown.push(`${tourId}.${step.id}: ${axis}`);
        });
      });
    });
    expect(unknown).toEqual([]);
  });
});

describe('game screen tour', () => {
  const steps = () => getTour('gameScreen').steps;

  it('walks the game screen left to right, ending at the right panel', () => {
    expect(steps().map(s => s.id)).toEqual([
      'characterCard', 'characterList', 'sceneSelector', 'windowBar', 'sceneControls',
      'layerSelector', 'drawingToolbar', 'onlineUsers', 'tabsNav', 'diceControls',
    ]);
  });

  it('puts the layer step before the tool step, matching the on-screen stacking', () => {
    const ids = steps().map(s => s.id);
    expect(ids.indexOf('layerSelector')).toBeLessThan(ids.indexOf('drawingToolbar'));
  });

  it('marks the GM-only steps of the game screen tour', () => {
    const gmOnly = steps().filter(s => s.roles && !s.roles.includes('player'));
    expect(gmOnly.map(s => s.id)).toEqual(['sceneSelector', 'layerSelector']);
  });

  it('gives the GM ten steps and the player eight', () => {
    expect(steps().filter(s => s.roles.includes('gm'))).toHaveLength(10);
    expect(steps().filter(s => s.roles.includes('player'))).toHaveLength(8);
  });

  it('varies the scene control text by control scheme and the tool text by role', () => {
    expect(steps().find(s => s.id === 'sceneControls').variants).toEqual(['byScheme']);
    expect(steps().find(s => s.id === 'drawingToolbar').variants).toEqual(['byRole']);
  });
});

// Kotwice kroków to gołe selektory CSS na istniejące klasy (patrz komentarz
// na górze tours/gameScreen.js) — nie ma nic, co by je wiązało z markupem na
// poziomie kompilatora. Już raz przemianowanie klasy po cichu wyrzuciło krok
// z samouczka (patrz engine/useGameTour). Ten test czyta całe źródło src/ i
// pilnuje, żeby każda klasa z target dalej istniała gdziekolwiek w drzewie.
// Katalog tours/ jest wykluczony: to tam żyją definicje target, więc każda
// klasa "istnieje" w nim trywialnie jako literał selektora — sprawdzenie musi
// trafić na prawdziwe użycie klasy w markupie/CSS, nie na jej własną deklarację.
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

describe('tour anchors', () => {
  it('keeps every step target pointed at a class that still exists somewhere in src', () => {
    const srcDir = path.join(__dirname, '..', '..', '..');
    const source = readAllSourceFiles(srcDir, __dirname);

    TOUR_IDS.forEach(tourId => {
      getTour(tourId).steps.forEach(step => {
        const targets = Array.isArray(step.target) ? step.target : [step.target];
        targets.forEach(target => {
          expect(source.includes(target.replace(/^\./, ''))).toBe(true);
        });
      });
    });
  });
});
