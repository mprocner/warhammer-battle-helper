import React from 'react';
import { render, screen } from '@testing-library/react';
import '../../../i18n';
import TabsLegend from './TabsLegend';

describe('TabsLegend', () => {
  it('lists all nine tabs for the GM', () => {
    const { container } = render(<TabsLegend isGM={true} />);
    expect(container.querySelectorAll('.tour-tabs-legend__item')).toHaveLength(9);
  });

  it('lists only the four a player can see', () => {
    const { container } = render(<TabsLegend isGM={false} />);
    expect(container.querySelectorAll('.tour-tabs-legend__item')).toHaveLength(4);
  });

  it('shows translated tab names, not raw keys', () => {
    render(<TabsLegend isGM={false} />);
    expect(screen.queryByText(/rightPanel\.tabs\./)).toBeNull();
    expect(screen.queryByText(/tutorial\.tabs\./)).toBeNull();
  });

  it('tells the reader that each tab has its own tutorial', () => {
    render(<TabsLegend isGM={true} />);
    expect(document.body.querySelector('.tour-tabs-legend__outro')).not.toBeNull();
  });
});
