import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import ModeSwitchLabel from './ModeSwitchLabel';

describe('ModeSwitchLabel', () => {
  it('portals into document.body rather than rendering in place', () => {
    const { container } = render(
      <ModeSwitchLabel x={0} y={0} labelKey="scenes.fogLayer" onDone={() => {}} />
    );
    expect(container.querySelector('.mode-switch-label')).toBeNull();
    expect(document.body.querySelector('.mode-switch-label')).not.toBeNull();
  });

  it('renders the translated label, not the raw key', () => {
    render(<ModeSwitchLabel x={0} y={0} labelKey="scenes.fogLayer" onDone={() => {}} />);
    const label = screen.getByText('Fog of War');
    expect(label.textContent).not.toBe('scenes.fogLayer');
  });

  it('calls onDone when the CSS animation ends', () => {
    const onDone = jest.fn();
    render(<ModeSwitchLabel x={0} y={0} labelKey="scenes.fogLayer" onDone={onDone} />);
    fireEvent.animationEnd(document.body.querySelector('.mode-switch-label'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
