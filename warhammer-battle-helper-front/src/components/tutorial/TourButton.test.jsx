import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import TourButton from './TourButton';
import { TutorialProvider, useTutorial } from './TutorialContext';

const Probe = () => {
  const { activeTourId } = useTutorial();
  return <span data-testid="active">{activeTourId || 'none'}</span>;
};

const renderIn = (ui) => render(<TutorialProvider>{ui}<Probe /></TutorialProvider>);

describe('TourButton', () => {
  it('renders a button for a registered tour', () => {
    renderIn(<TourButton tourId="gameScreen" />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders nothing for an unknown tour instead of breaking the panel', () => {
    const { container } = render(
      <TutorialProvider><TourButton tourId="nope" /></TutorialProvider>
    );
    expect(container.querySelector('.tour-button')).toBeNull();
  });

  it('publishes the tour id when clicked', () => {
    renderIn(<TourButton tourId="gameScreen" />);
    expect(screen.getByTestId('active')).toHaveTextContent('none');
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('active')).toHaveTextContent('gameScreen');
  });

  it('labels itself with the translated hint, not a raw key', () => {
    renderIn(<TourButton tourId="gameScreen" />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('title')).not.toContain('tutorial.');
    expect(button.getAttribute('title')).toBeTruthy();
    expect(button.getAttribute('aria-label')).toBe(button.getAttribute('title'));
  });
});
