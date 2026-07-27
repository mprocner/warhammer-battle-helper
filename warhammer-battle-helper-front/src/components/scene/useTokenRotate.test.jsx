import React, { useRef, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useTokenRotate } from './useTokenRotate';

// Harness: a 100x100 box whose centre sits at (150, 150) in screen coordinates.
function Harness({ enabled = true, onCommit = () => {}, initial = 0 }) {
  const containerRef = useRef(null);
  const [rotation, setRotation] = useState(initial);
  const { isRotating, handleRotateStart } = useTokenRotate({
    containerRef, rotation, setRotation, enabled, onCommit,
  });
  return (
    <div ref={containerRef} data-testid="box">
      <span data-testid="angle">{rotation}</span>
      <span data-testid="state">{isRotating ? 'rotating' : 'idle'}</span>
      <button data-testid="handle" onMouseDown={handleRotateStart}>rotate</button>
    </div>
  );
}

// jsdom has no layout, so getBoundingClientRect always returns zeros — stub it.
function stubBox() {
  screen.getByTestId('box').getBoundingClientRect = () => ({
    left: 100, top: 100, width: 100, height: 100, right: 200, bottom: 200, x: 100, y: 100,
  });
}

describe('useTokenRotate', () => {
  it('starts idle', () => {
    render(<Harness />);
    expect(screen.getByTestId('state')).toHaveTextContent('idle');
  });

  it('enters the rotating state on mousedown', () => {
    render(<Harness />);
    stubBox();
    fireEvent.mouseDown(screen.getByTestId('handle'), { clientX: 150, clientY: 100 });
    expect(screen.getByTestId('state')).toHaveTextContent('rotating');
  });

  it('does nothing when disabled', () => {
    render(<Harness enabled={false} />);
    stubBox();
    fireEvent.mouseDown(screen.getByTestId('handle'), { clientX: 150, clientY: 100 });
    expect(screen.getByTestId('state')).toHaveTextContent('idle');
  });

  it('follows the pointer around the centre', () => {
    render(<Harness />);
    stubBox();
    // Grab at 12 o'clock (dx 0, dy -50), drag to 3 o'clock (dx +50, dy 0): a quarter turn.
    fireEvent.mouseDown(screen.getByTestId('handle'), { clientX: 150, clientY: 100 });
    fireEvent.mouseMove(document, { clientX: 200, clientY: 150 });
    expect(screen.getByTestId('angle')).toHaveTextContent('90');
  });

  it('commits the final angle once on mouseup', () => {
    const onCommit = jest.fn();
    render(<Harness onCommit={onCommit} />);
    stubBox();
    fireEvent.mouseDown(screen.getByTestId('handle'), { clientX: 150, clientY: 100 });
    fireEvent.mouseMove(document, { clientX: 200, clientY: 150 });
    fireEvent.mouseUp(document, { clientX: 200, clientY: 150 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(90);
    expect(screen.getByTestId('state')).toHaveTextContent('idle');
  });

  it('magnetically snaps a near-45 drag', () => {
    const onCommit = jest.fn();
    render(<Harness onCommit={onCommit} />);
    stubBox();
    // Grab at 12 o'clock, release just past 3 o'clock — within snapAngle's 10 deg threshold of 90.
    fireEvent.mouseDown(screen.getByTestId('handle'), { clientX: 150, clientY: 100 });
    fireEvent.mouseUp(document, { clientX: 200, clientY: 155 });
    expect(onCommit).toHaveBeenCalledWith(90);
  });
});
