import React from 'react';
import { render, screen } from '@testing-library/react';
import '../../i18n';
import RollPrompt from './RollPrompt';

const pending = { skillKey: 'fld_1', label: 'Perswazja' };

describe('RollPrompt', () => {
  it('renders nothing without a pending roll', () => {
    const { container } = render(<RollPrompt pending={null} pos={null} config={{ kind: 'number' }} onConfirm={() => {}} onCancel={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the number prompt for the number kind', () => {
    render(<RollPrompt pending={pending} pos={null} config={{ kind: 'number', presets: [], step: 1 }} onConfirm={() => {}} onCancel={() => {}} />);
    expect(document.getElementById('roll-modifier-input')).toBeInTheDocument();
  });

  it('shows the dice column for the dice kind', () => {
    render(<RollPrompt pending={pending} pos={{ x: 10, y: 10 }} config={{ kind: 'dice', maxEdge: 1, maxSetback: 1 }} onConfirm={() => {}} onCancel={() => {}} />);
    expect(document.getElementById('roll-modifier-input')).toBeNull();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });
});
