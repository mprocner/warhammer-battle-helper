import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useGameTour, seenKey } from './useGameTour';

// Krok z listą kotwic nie istnieje jeszcze w żadnym zarejestrowanym turze
// (patrz tours/gameScreen.js), więc żeby dowieść, że hook przekazuje trafiony
// indeks (a nie sztywne 0), wstrzykujemy własny tur przez ten sam mechanizm
// rejestru co prawdziwe tury — patrz komentarz przy jest.mock('../tours').
const ARRAY_TARGET_TOUR_ID = 'arrayTargetTest';
const ARRAY_TARGET_TOUR = {
  id: ARRAY_TARGET_TOUR_ID,
  steps: [
    { id: 'arrayStep', target: ['.missing', '.present'], roles: ['gm', 'player'] },
  ],
};

jest.mock('../tours', () => {
  const actual = jest.requireActual('../tours');
  return {
    ...actual,
    getTour: (id) => (id === ARRAY_TARGET_TOUR_ID ? ARRAY_TARGET_TOUR : actual.getTour(id)),
  };
});

const OPEN = { leftHidden: false, rightHidden: false, topCollapsed: false };
const COLLAPSED = { leftHidden: true, rightHidden: true, topCollapsed: true };

// Domyślnie udajemy, że każda kotwica istnieje; pojedyncze testy zawężają listę.
const allTargets = () => jest.fn(() => ({}));

const setup = ({ tourId = 'gameScreen', role = 'gm', panels = OPEN, queryTarget = allTargets(), screenReady = true } = {}, options = {}) => {
  const onReveal = jest.fn();
  const view = renderHook(
    (props) => useGameTour({ tourId, role, onReveal, queryTarget, ...props }),
    { initialProps: { panels, screenReady }, ...options }
  );
  return { view, onReveal, queryTarget };
};

describe('useGameTour', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => jest.restoreAllMocks());

  it('auto-starts on the first visit and stores nothing yet', () => {
    const { view } = setup();
    expect(view.result.current.running).toBe(true);
    expect(view.result.current.stepIndex).toBe(0);
    expect(localStorage.getItem(seenKey('gm'))).toBeNull();
  });

  it('does not auto-start once the role has seen it', () => {
    localStorage.setItem(seenKey('gm'), '1');
    const { view } = setup();
    expect(view.result.current.running).toBe(false);
  });

  it('keeps the roles apart', () => {
    localStorage.setItem(seenKey('player'), '1');
    const { view } = setup({ role: 'gm' });
    expect(view.result.current.running).toBe(true);
  });

  it('filters GM-only steps out for a player even when every anchor is present', () => {
    const { view } = setup({ role: 'player' });
    const ids = view.result.current.steps.map(s => s.id);
    expect(view.result.current.steps).toHaveLength(8);
    expect(ids).not.toContain('sceneSelector');
    expect(ids).not.toContain('layerSelector');
  });

  it('starts from the button even when the flag is set', () => {
    localStorage.setItem(seenKey('gm'), '1');
    const { view } = setup();
    act(() => view.result.current.start());
    expect(view.result.current.running).toBe(true);
    expect(view.result.current.stepIndex).toBe(0);
  });

  it('drops steps whose anchor is not on screen', () => {
    const queryTarget = jest.fn(sel => (sel === '.layer-selector' || sel === '.drawing-toolbar' ? null : {}));
    const { view } = setup({ queryTarget });
    expect(view.result.current.steps.map(s => s.id)).not.toContain('layerSelector');
    expect(view.result.current.steps.map(s => s.id)).not.toContain('drawingToolbar');
    expect(view.result.current.steps).toHaveLength(8);
  });

  it('stays put when no anchor at all is on screen', () => {
    const { view } = setup({ queryTarget: jest.fn(() => null) });
    expect(view.result.current.running).toBe(false);
    expect(view.result.current.steps).toHaveLength(0);
  });

  it('does not poison a later legitimate start after an early bail', () => {
    // Pierwszy auto-start nie ma czego zaczepić i odbija się — to nie może
    // trwale zablokować startu, gdy kotwice się później pojawią.
    const { view } = setup({ queryTarget: jest.fn(() => null) });
    expect(view.result.current.running).toBe(false);

    view.rerender({ panels: OPEN, queryTarget: allTargets() });
    expect(view.result.current.running).toBe(true);
    expect(view.result.current.stepIndex).toBe(0);
  });

  it('asks the parent to reveal the panel a step needs', () => {
    const { onReveal } = setup();
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(onReveal).toHaveBeenCalledWith(expect.objectContaining({ id: 'characterCard' }));
  });

  it('holds the step back until the panel actually opened', () => {
    const { view } = setup({ panels: { ...OPEN, rightHidden: true } });
    act(() => view.result.current.goTo(8)); // tabsNav, wymaga prawego panelu
    expect(view.result.current.stepIndex).toBe(0);
    view.rerender({ panels: OPEN });
    expect(view.result.current.stepIndex).toBe(8);
  });

  it('holds a step back until the left panel opens', () => {
    const { view } = setup({ panels: { ...OPEN, leftHidden: true } });
    // Pierwszy krok (characterCard) sam wymaga lewego panelu, więc auto-start
    // ląduje w stanie pending, nie running.
    expect(view.result.current.running).toBe(false);
    act(() => view.result.current.goTo(4)); // sceneControls, bez reveal
    expect(view.result.current.stepIndex).toBe(4);
    act(() => view.result.current.goTo(0)); // characterCard, wymaga lewego panelu
    expect(view.result.current.stepIndex).toBe(4); // niezmienione, lewy wciąż zwinięty
    view.rerender({ panels: OPEN });
    expect(view.result.current.stepIndex).toBe(0);
  });

  it('holds a step back until the top panel opens', () => {
    const { view } = setup({ panels: { ...OPEN, topCollapsed: true } });
    act(() => view.result.current.goTo(2)); // sceneSelector, wymaga górnego panelu
    expect(view.result.current.stepIndex).toBe(0);
    view.rerender({ panels: OPEN });
    expect(view.result.current.stepIndex).toBe(2);
  });

  it('commits a step with no reveal requirement immediately, even fully collapsed', () => {
    const { view } = setup({ panels: COLLAPSED });
    act(() => view.result.current.goTo(4)); // sceneControls, brak pola reveal
    expect(view.result.current.stepIndex).toBe(4);
  });

  it('moves forward and back through goTo', () => {
    const { view } = setup();
    act(() => view.result.current.goTo(1));
    expect(view.result.current.stepIndex).toBe(1);
    act(() => view.result.current.goTo(0));
    expect(view.result.current.stepIndex).toBe(0);
  });

  it('finishing past the last step marks the tour seen', () => {
    const { view } = setup();
    act(() => view.result.current.goTo(view.result.current.steps.length));
    expect(view.result.current.running).toBe(false);
    expect(localStorage.getItem(seenKey('gm'))).toBe('1');
  });

  it('skipping marks the tour seen too', () => {
    const { view } = setup();
    act(() => view.result.current.finish());
    expect(view.result.current.running).toBe(false);
    expect(localStorage.getItem(seenKey('gm'))).toBe('1');
  });

  it('waits for the role before doing anything, then auto-starts once one arrives', () => {
    const { view, onReveal } = setup({ role: null });
    expect(view.result.current.running).toBe(false);
    expect(onReveal).not.toHaveBeenCalled();
    expect(localStorage.getItem(seenKey('gm'))).toBeNull();

    view.rerender({ panels: OPEN, role: 'gm' });
    expect(view.result.current.running).toBe(true);
    expect(view.result.current.stepIndex).toBe(0);
  });

  // Reprodukuje BUG realny: DndContext renderuje placeholder "Ładowanie postaci..."
  // dopóki fetch się nie skończy, więc w chwili auto-startu istnieją tylko kotwice,
  // które RightPanel montuje samodzielnie (tabsNav, diceControls) — reszta drzewa
  // (sidebar, scena, online-users) jeszcze nie istnieje w DOM. Auto-start musi
  // czekać na sygnał gotowości ekranu, a nie łapać co popadnie w danej chwili.
  it('does not auto-start while the screen is still assembling, then starts with the full list once ready', () => {
    const onlyRightPanelAnchors = jest.fn(
      sel => (sel === '.right-panel__tabs-nav' || sel === '.dice-controls' ? {} : null)
    );
    const { view } = setup({ screenReady: false, queryTarget: onlyRightPanelAnchors });
    expect(view.result.current.running).toBe(false);
    expect(view.result.current.steps).toHaveLength(0);
    expect(localStorage.getItem(seenKey('gm'))).toBeNull();

    view.rerender({ panels: OPEN, screenReady: true, queryTarget: allTargets() });
    expect(view.result.current.running).toBe(true);
    expect(view.result.current.stepIndex).toBe(0);
    expect(view.result.current.steps).toHaveLength(10); // pełna lista dla 'gm', nie okrojona do 2
  });

  it('lets manual start() from the "?" button run even while the screen is not ready yet', () => {
    const { view } = setup({ screenReady: false });
    act(() => view.result.current.start());
    expect(view.result.current.running).toBe(true);
    expect(view.result.current.stepIndex).toBe(0);
  });

  it('auto-starts even when reading localStorage throws (private window)', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied');
    });
    const { view } = setup();
    expect(view.result.current.running).toBe(true);
  });

  it('does not crash when writing localStorage throws while finishing', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied');
    });
    const { view } = setup();
    expect(() => act(() => view.result.current.finish())).not.toThrow();
    expect(view.result.current.running).toBe(false);
  });

  it('forwards the index of the selector that actually matched, not a hardcoded first', () => {
    const queryTarget = jest.fn(sel => (sel === '.present' ? {} : null));
    const { view } = setup({ tourId: ARRAY_TARGET_TOUR_ID, queryTarget });
    expect(view.result.current.steps).toHaveLength(1);
    expect(view.result.current.steps[0]).toEqual(expect.objectContaining({
      resolvedTarget: '.present',
      targetIndex: 1,
    }));
  });

  describe('under React.StrictMode', () => {
    it('auto-starts exactly once', () => {
      const { view, onReveal } = setup({}, { wrapper: React.StrictMode });
      expect(view.result.current.running).toBe(true);
      expect(view.result.current.stepIndex).toBe(0);
      expect(onReveal).toHaveBeenCalledTimes(1);
      expect(onReveal).toHaveBeenCalledWith(expect.objectContaining({ id: 'characterCard' }));
    });
  });
});
