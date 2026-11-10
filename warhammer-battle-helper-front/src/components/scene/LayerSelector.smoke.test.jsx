import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import LayerSelector from './LayerSelector';

describe('LayerSelector', () => {
  it('renders three layer buttons for GM', () => {
    render(<LayerSelector imageEditLayer="background" onImageEditLayerChange={() => {}} isGM />);
    expect(document.querySelectorAll('.layer-selector__btn')).toHaveLength(3);
  });

  it('renders nothing for non-GM', () => {
    const { container } = render(
      <LayerSelector imageEditLayer="background" onImageEditLayerChange={() => {}} isGM={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('marks the armed layer active', () => {
    render(<LayerSelector imageEditLayer="tokens" onImageEditLayerChange={() => {}} isGM />);
    const active = document.querySelectorAll('.layer-selector__btn--active');
    expect(active).toHaveLength(1);
    expect(active[0].getAttribute('aria-label')).toBe('Tokens');
  });

  it('shows icons only — the layer name lives in the tooltip', () => {
    render(<LayerSelector imageEditLayer="background" onImageEditLayerChange={() => {}} isGM />);
    document.querySelectorAll('.layer-selector__btn').forEach(btn => {
      expect(btn.textContent).toBe(btn.querySelector('.layer-selector__tooltip').textContent);
    });
  });

  it('calls onImageEditLayerChange when a layer is clicked', () => {
    const onChange = jest.fn();
    render(<LayerSelector imageEditLayer="background" onImageEditLayerChange={onChange} isGM />);
    fireEvent.click(screen.getByRole('button', { name: 'GM Layer' }));
    expect(onChange).toHaveBeenCalledWith('gm');
  });
});
