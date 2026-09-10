import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import TourTooltip from './TourTooltip';

const props = (overrides = {}) => ({
  index: 0,
  size: 10,
  isLastStep: false,
  step: { title: 'Selected character', content: <p>Body text</p> },
  tooltipProps: {},
  backProps: { onClick: jest.fn() },
  primaryProps: { onClick: jest.fn() },
  skipProps: { onClick: jest.fn() },
  ...overrides,
});

describe('TourTooltip', () => {
  it('renders the title, the body and the progress counter', () => {
    render(<TourTooltip {...props()} />);
    expect(screen.getByText('Selected character')).toBeInTheDocument();
    expect(screen.getByText('Body text')).toBeInTheDocument();
    expect(screen.getByText('1 / 10')).toBeInTheDocument();
  });

  it('hides Back on the first step', () => {
    render(<TourTooltip {...props()} />);
    expect(screen.queryByText('Back')).toBeNull();
  });

  it('shows Back from the second step on', () => {
    render(<TourTooltip {...props({ index: 1 })} />);
    expect(screen.getByText('Back')).toBeInTheDocument();
  });

  it('labels the primary button Next mid-tour and Got it at the end', () => {
    const { rerender } = render(<TourTooltip {...props()} />);
    expect(screen.getByText('Next')).toBeInTheDocument();
    rerender(<TourTooltip {...props({ index: 9, isLastStep: true })} />);
    expect(screen.getByText('Got it')).toBeInTheDocument();
  });

  it('wires the buttons to the props Joyride handed it', () => {
    const p = props({ index: 1 });
    render(<TourTooltip {...p} />);
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByText('Skip'));
    expect(p.primaryProps.onClick).toHaveBeenCalledTimes(1);
    expect(p.backProps.onClick).toHaveBeenCalledTimes(1);
    expect(p.skipProps.onClick).toHaveBeenCalledTimes(1);
  });
});
