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
    expect(active[0].textContent).toContain('Tokens');
  });

  it('calls onImageEditLayerChange when a layer is clicked', () => {
    const onChange = jest.fn();
    render(<LayerSelector imageEditLayer="background" onImageEditLayerChange={onChange} isGM />);
    // label 'GM' comes from scenes.layerGmShort; getAllByText because the tooltip span
    // ('GM Layer' from scenes.layerGm) also lives in the same button — take the label node.
    fireEvent.click(screen.getByText('GM').closest('.layer-selector__btn'));
    expect(onChange).toHaveBeenCalledWith('gm');
  });
});
