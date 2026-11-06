/* eslint-disable testing-library/no-node-access -- the overlay's column and buttons are located by BEM class and parent */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import EdgeDiceOverlay, { zeroAlignedTop } from './EdgeDiceOverlay';

const labels = () => screen.getAllByRole('button').map(b => b.textContent);

describe('EdgeDiceOverlay', () => {
  it.each([
    [{ maxEdge: 2, maxSetback: 2 }, ['+2', '+1', '0', '-1', '-2']],
    [{ maxEdge: 0, maxSetback: 2 }, ['0', '-1', '-2']],
    [{ maxEdge: 3, maxSetback: 0 }, ['+3', '+2', '+1', '0']],
  ])('renders the column for %j', (config, expected) => {
    render(<EdgeDiceOverlay pos={{ x: 100, y: 300 }} config={config} onSelect={() => {}} onCancel={() => {}} />);
    expect(labels()).toEqual(expected);
  });

  it('reports the picked dice count', () => {
    const onSelect = jest.fn();
    render(<EdgeDiceOverlay pos={{ x: 100, y: 300 }} config={{ maxEdge: 2, maxSetback: 2 }} onSelect={onSelect} onCancel={() => {}} />);
    fireEvent.click(screen.getByText('-1'));
    expect(onSelect).toHaveBeenCalledWith(-1);
  });

  it('cancels on a backdrop click', () => {
    const onCancel = jest.fn();
    const { baseElement } = render(<EdgeDiceOverlay pos={{ x: 100, y: 300 }} config={{ maxEdge: 1, maxSetback: 1 }} onSelect={() => {}} onCancel={onCancel} />);
    fireEvent.click(baseElement.querySelector('.edge-dice-overlay'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('focuses the zero button on open', () => {
    render(<EdgeDiceOverlay pos={{ x: 100, y: 300 }} config={{ maxEdge: 2, maxSetback: 2 }} onSelect={() => {}} onCancel={() => {}} />);
    expect(document.activeElement).toBe(screen.getByText('0'));
  });

  it('cancels on Escape', () => {
    const onCancel = jest.fn();
    render(<EdgeDiceOverlay pos={{ x: 100, y: 300 }} config={{ maxEdge: 1, maxSetback: 1 }} onSelect={() => {}} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByText('0'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not cancel when a dice button is clicked', () => {
    const onCancel = jest.fn();
    render(<EdgeDiceOverlay pos={{ x: 100, y: 300 }} config={{ maxEdge: 1, maxSetback: 1 }} onSelect={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('+1'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  // The 0 button's centre lands on the click: 2 edge buttons of 36px + 2px gap above it, half a
  // button, and the popup's 4px padding + 2px border.
  it('aligns the zero button with the click', () => {
    expect(zeroAlignedTop(500, 2)).toBe(500 - 2 * 38 - 18 - 6);
    expect(zeroAlignedTop(500, 0)).toBe(500 - 18 - 6);
  });
});
