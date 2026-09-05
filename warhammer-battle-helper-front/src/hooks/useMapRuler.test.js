import React from 'react';
import { renderHook, act } from '@testing-library/react';
import useMapRuler from './useMapRuler';

const GRID = { gridWidth: 20, gridHeight: 20 };

function setup(sendMessage, overrides = {}, options = {}) {
  return renderHook(() => useMapRuler({
    sendMessage,
    sceneId: 'scene-1',
    userId: 'gm-1',
    userName: 'GM',
    ...GRID,
    ...overrides,
  }), options);
}

describe('useMapRuler', () => {
  test('broadcasts a measurement started on the grid', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.start({ col: 3, row: 4 }));

    expect(sendMessage).toHaveBeenCalledWith('MAP_RULER', {
      sceneId: 'scene-1',
      userId: 'gm-1',
      name: 'GM',
      from: { col: 3, row: 4 },
      to: { col: 3, row: 4 },
      active: true,
      aoe: true,
    });

    act(() => result.current.end());

    expect(sendMessage).toHaveBeenLastCalledWith('MAP_RULER', expect.objectContaining({ active: false }));
  });

  test('keeps the ruler local when the measurement starts in the staging margin', () => {
    const sendMessage = jest.fn();
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1000);
    const { result } = setup(sendMessage);

    act(() => result.current.start({ col: -4, row: 5 }));

    // The measurer still gets their own line and readout — only the broadcast is suppressed.
    expect(result.current.ruler).toEqual({ from: { col: -4, row: 5 }, to: { col: -4, row: 5 } });

    nowSpy.mockReturnValue(1060); // past SEND_THROTTLE_MS, so only the gate can stop this send
    act(() => result.current.move({ col: 6, row: 5 }));
    expect(result.current.ruler).toEqual({ from: { col: -4, row: 5 }, to: { col: 6, row: 5 } });

    act(() => result.current.end());

    expect(sendMessage).not.toHaveBeenCalled();
    nowSpy.mockRestore();
  });

  test('keeps the ruler local when the measurement starts past the far grid edge', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.start({ col: 5, row: 24 }));
    act(() => result.current.end());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('judges the SNAPPED origin, not the raw cursor point', () => {
    const sendMessage = jest.fn();
    // A token staged in the margin magnetizes a press just inside the grid to its off-scene centre;
    // that centre is what would be broadcast, so it is what the gate must judge.
    const snapPoint = () => ({ col: -2.5, row: 5 });
    const { result } = setup(sendMessage, { snapPoint });

    act(() => result.current.start({ col: 0.2, row: 5 }));
    act(() => result.current.end());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('keeps the ruler local when the grid dimensions are missing', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage, { gridWidth: undefined, gridHeight: undefined });

    act(() => result.current.start({ col: 1, row: 1 }));
    act(() => result.current.end());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  // The ENDPOINT gate. Unlike the drag ruler — where the token stays visible for the whole gesture,
  // so only the start can disclose anything — the manual ruler's far end IS the disclosure: dragging
  // it onto a token parked in the GM margin would publish that token's exact centre.
  describe('endpoint off-scene', () => {
    // Back-to-back act() calls land inside the real 50 ms SEND_THROTTLE_MS window, which would
    // swallow a move's send on its own; mock Date.now like useDragRuler.test.js does so only the
    // gate under test can stop it.
    function setupTimed(sendMessage) {
      const nowSpy = jest.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1000);
      return { ...setup(sendMessage), nowSpy };
    }

    test('stops broadcasting and emits exactly one clearing frame', () => {
      const sendMessage = jest.fn();
      const { result, nowSpy } = setupTimed(sendMessage);

      act(() => result.current.start({ col: 3, row: 3 }));
      expect(sendMessage).toHaveBeenCalledTimes(1);

      nowSpy.mockReturnValue(1060);
      act(() => result.current.move({ col: -8, row: 3 }));

      // One frame only, it closes the line, and it carries no off-scene coordinate.
      expect(sendMessage).toHaveBeenCalledTimes(2);
      expect(sendMessage).toHaveBeenLastCalledWith('MAP_RULER', expect.objectContaining({
        from: { col: 3, row: 3 },
        to: { col: 3, row: 3 },
        active: false,
      }));
      // The measurer keeps their own line and readout.
      expect(result.current.ruler).toEqual({ from: { col: 3, row: 3 }, to: { col: -8, row: 3 } });

      nowSpy.mockRestore();
    });

    test('a further off-scene move emits nothing at all', () => {
      const sendMessage = jest.fn();
      const { result, nowSpy } = setupTimed(sendMessage);

      act(() => result.current.start({ col: 3, row: 3 }));
      nowSpy.mockReturnValue(1060);
      act(() => result.current.move({ col: -8, row: 3 }));
      sendMessage.mockClear();

      nowSpy.mockReturnValue(1120);
      act(() => result.current.move({ col: -9, row: 4 }));

      expect(sendMessage).not.toHaveBeenCalled();
      expect(result.current.ruler).toEqual({ from: { col: 3, row: 3 }, to: { col: -9, row: 4 } });

      nowSpy.mockRestore();
    });

    test('end() after an off-scene endpoint sends no second closing frame', () => {
      const sendMessage = jest.fn();
      const { result, nowSpy } = setupTimed(sendMessage);

      act(() => result.current.start({ col: 3, row: 3 }));
      nowSpy.mockReturnValue(1060);
      act(() => result.current.move({ col: -8, row: 3 }));
      sendMessage.mockClear();

      act(() => result.current.end());

      expect(sendMessage).not.toHaveBeenCalled();
      expect(result.current.ruler).toBeNull();
      nowSpy.mockRestore();
    });

    test('broadcasting resumes when the endpoint comes back on-scene', () => {
      const sendMessage = jest.fn();
      const { result, nowSpy } = setupTimed(sendMessage);

      act(() => result.current.start({ col: 3, row: 3 }));
      nowSpy.mockReturnValue(1060);
      act(() => result.current.move({ col: -8, row: 3 }));
      sendMessage.mockClear();

      nowSpy.mockReturnValue(1120);
      act(() => result.current.move({ col: 7, row: 3 }));

      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(sendMessage).toHaveBeenLastCalledWith('MAP_RULER', expect.objectContaining({
        from: { col: 3, row: 3 },
        to: { col: 7, row: 3 },
        active: true,
      }));
      expect(result.current.ruler).toEqual({ from: { col: 3, row: 3 }, to: { col: 7, row: 3 } });

      // ...and the measurement closes normally, because a line is on screen again.
      act(() => result.current.end());
      expect(sendMessage).toHaveBeenLastCalledWith('MAP_RULER', expect.objectContaining({ active: false }));

      nowSpy.mockRestore();
    });

    test('judges the SNAPPED endpoint — a staged token magnetizes the far end off-scene', () => {
      const sendMessage = jest.fn();
      // Snap only the far end: the origin is pressed on the grid, the endpoint lands in the radius
      // of a token parked in the margin and is magnetized to its exact centre.
      const snapPoint = (p) => (p.col > 5 ? { col: -2.5, row: 5 } : p);
      const nowSpy = jest.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1000);
      const { result } = setup(sendMessage, { snapPoint });

      act(() => result.current.start({ col: 3, row: 3 }));
      sendMessage.mockClear();
      nowSpy.mockReturnValue(1060);
      act(() => result.current.move({ col: 6, row: 5 }));

      // Only the clearing frame — the staged token's centre never reaches the wire.
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(sendMessage).toHaveBeenLastCalledWith('MAP_RULER', expect.objectContaining({ active: false }));
      expect(sendMessage).not.toHaveBeenCalledWith('MAP_RULER', expect.objectContaining({
        to: { col: -2.5, row: 5 },
      }));
      // The local line still reflects the snapped (off-scene) endpoint even though nothing went out.
      expect(result.current.ruler).toEqual({ from: { col: 3, row: 3 }, to: { col: -2.5, row: 5 } });

      nowSpy.mockRestore();
    });

    test('a measurement private from the start sends nothing, clearing frame included', () => {
      const sendMessage = jest.fn();
      const { result, nowSpy } = setupTimed(sendMessage);

      act(() => result.current.start({ col: -4, row: 5 }));
      nowSpy.mockReturnValue(1060);
      act(() => result.current.move({ col: 6, row: 5 })); // endpoint back on the grid
      nowSpy.mockReturnValue(1120);
      act(() => result.current.move({ col: -7, row: 5 })); // and off again
      // Local readout keeps tracking every move regardless of privacy.
      expect(result.current.ruler).toEqual({ from: { col: -4, row: 5 }, to: { col: -7, row: 5 } });
      act(() => result.current.end());

      // Nothing was ever drawn on anyone's screen, so there is nothing to clear.
      expect(sendMessage).not.toHaveBeenCalled();
      nowSpy.mockRestore();
    });
  });

  test('a later on-scene measurement broadcasts again after a private one', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.start({ col: -1, row: 1 }));
    act(() => result.current.end());
    expect(sendMessage).not.toHaveBeenCalled();

    act(() => result.current.start({ col: 2, row: 2 }));
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  // The app itself renders inside React.StrictMode (src/index.js), and React 19 double-invokes
  // state updaters in development. A send (or a privateRef reset) placed inside a setRuler updater
  // therefore runs twice: the second pass sees the already-cleared flag and broadcasts the frame the
  // gate exists to suppress. Every send lives in the handler body precisely so this cannot happen.
  describe('under React.StrictMode', () => {
    test('a private measurement sends nothing across start, move and end', () => {
      const sendMessage = jest.fn();
      const nowSpy = jest.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1000);
      const { result } = setup(sendMessage, {}, { wrapper: React.StrictMode });

      act(() => result.current.start({ col: -4, row: 5 }));
      nowSpy.mockReturnValue(1060); // past SEND_THROTTLE_MS, so only the gate can stop this send
      act(() => result.current.move({ col: 6, row: 5 }));
      act(() => result.current.end());

      // Local readout still worked all the way through — only the broadcast is suppressed.
      expect(result.current.ruler).toBeNull();
      expect(sendMessage).not.toHaveBeenCalled();
      nowSpy.mockRestore();
    });

    test('an on-scene measurement broadcasts each logical frame exactly once', () => {
      const sendMessage = jest.fn();
      const nowSpy = jest.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1000);
      const { result } = setup(sendMessage, {}, { wrapper: React.StrictMode });

      act(() => result.current.start({ col: 3, row: 3 }));
      nowSpy.mockReturnValue(1060);
      act(() => result.current.move({ col: 5, row: 3 }));
      act(() => result.current.end());

      expect(sendMessage).toHaveBeenCalledTimes(3);
      nowSpy.mockRestore();
    });
  });

  test('ruler is null after end()', () => {
    const sendMessage = jest.fn();
    const { result } = setup(sendMessage);

    act(() => result.current.start({ col: 1, row: 1 }));
    expect(result.current.ruler).not.toBeNull();

    act(() => result.current.end());
    expect(result.current.ruler).toBeNull();
  });
});
