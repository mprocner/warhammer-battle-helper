import React from 'react';
import { render } from '@testing-library/react';
import DiceOverlay from './DiceOverlay';
import DiceAnimationContext from './DiceAnimationContext';

const fakeController = () => ({ attach: jest.fn(), detach: jest.fn() });

describe('DiceOverlay', () => {
  it('renders nothing outside a game session', () => {
    const { container } = render(<DiceOverlay />);
    expect(container.firstChild).toBeNull();
  });

  it('hands the controller a selector-safe element and takes it back on unmount', () => {
    const controller = fakeController();
    const { unmount } = render(
      <DiceAnimationContext.Provider value={controller}>
        <DiceOverlay />
      </DiceAnimationContext.Provider>
    );
    const el = controller.attach.mock.calls[0][0];
    expect(el.id).toMatch(/^dice-overlay-\d+$/);
    expect(document.querySelector(`#${el.id}`)).toBe(el); // the library looks it up this way
    expect(el).toHaveClass('dice-overlay');
    expect(el).toHaveAttribute('aria-hidden', 'true');

    unmount();
    expect(controller.detach).toHaveBeenCalledWith(el);
  });
});
