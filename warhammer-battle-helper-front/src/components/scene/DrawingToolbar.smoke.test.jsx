import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '../../i18n';
import DrawingToolbar from './DrawingToolbar';
import { modesForRole } from './sceneModes';

const baseProps = {
  editingLayer: 'select',
  onEditingLayerChange: () => {},
  activeTool: 'select',
  onActiveToolChange: () => {},
  brushSize: 10,
  onBrushSizeChange: () => {},
  drawingColor: '#ff0000',
  onDrawingColorChange: () => {},
  onUndoDrawing: () => {}, onClearDrawing: () => {},
  onUndoFog: () => {}, onClearFog: () => {}, onRevealAllFog: () => {},
  onDeleteSelected: () => {},
  isGM: true, canUndo: false, canUndoFog: false,
};

describe('DrawingToolbar mode tabs', () => {
  it('no longer renders the Images (grid) tab', () => {
    render(<DrawingToolbar {...baseProps} />);
    expect(screen.queryByText('Image layers')).toBeNull();
  });

  // Counts come from modesForRole, never from a literal — so adding an entry to
  // SCENE_MODES cannot silently fail to reach the toolbar.
  it('renders one tab per mode available to a GM', () => {
    const { container } = render(<DrawingToolbar {...baseProps} />);
    expect(container.querySelectorAll('.drawing-toolbar__tab'))
      .toHaveLength(modesForRole(true).length);
  });

  it('renders one tab per mode available to a player', () => {
    const { container } = render(<DrawingToolbar {...baseProps} isGM={false} />);
    expect(container.querySelectorAll('.drawing-toolbar__tab'))
      .toHaveLength(modesForRole(false).length);
  });

  it('renders GM tab tooltips in toolbar order', () => {
    const { container } = render(<DrawingToolbar {...baseProps} />);
    const labels = [...container.querySelectorAll('.drawing-toolbar__tab .drawing-toolbar__tooltip')]
      .map(el => el.textContent);
    const expected = modesForRole(true).map(m => i18n.t(m.labelKey));
    expect(labels).toEqual(expected);
    // Guard: a missing translation would make both sides equal to the raw key.
    expect(labels.some(l => l.startsWith('scenes.'))).toBe(false);
  });

  it('hides GM-only modes from players', () => {
    const { container } = render(<DrawingToolbar {...baseProps} isGM={false} />);
    const labels = [...container.querySelectorAll('.drawing-toolbar__tab .drawing-toolbar__tooltip')]
      .map(el => el.textContent);
    expect(labels).not.toContain('Fog of War');
  });

  it('marks only the active mode tab with aria-pressed', () => {
    const modes = modesForRole(true);
    const activeMode = modes[1]; // any non-default mode, so both true and false cases show up
    const { container } = render(
      <DrawingToolbar {...baseProps} editingLayer={activeMode.value} />
    );
    const tabs = [...container.querySelectorAll('.drawing-toolbar__tab')];
    tabs.forEach((tab, i) => {
      expect(tab).toHaveAttribute('aria-pressed', String(modes[i].value === activeMode.value));
    });
  });

  it('clicking the active tab returns to the default tool', () => {
    const calls = [];
    render(
      <DrawingToolbar
        {...baseProps}
        editingLayer="fog"
        onEditingLayerChange={v => calls.push(v)}
      />
    );
    fireEvent.click(screen.getByText('Fog of War').closest('button'));
    expect(calls).toEqual(['select']);
  });

  it('clicking an inactive tab selects it', () => {
    const calls = [];
    render(
      <DrawingToolbar
        {...baseProps}
        editingLayer="select"
        onEditingLayerChange={v => calls.push(v)}
      />
    );
    fireEvent.click(screen.getByText('Fog of War').closest('button'));
    expect(calls).toEqual(['fog']);
  });
});

describe('DrawingToolbar tools', () => {
  it('no longer offers a pan tool inside drawing mode', () => {
    const { container } = render(<DrawingToolbar {...baseProps} editingLayer="drawing" />);
    const labels = [...container.querySelectorAll('.drawing-toolbar__tool .drawing-toolbar__tooltip')]
      .map(el => el.textContent);
    expect(labels).not.toContain('Pan & move tokens');
  });

  it('no longer offers a pan tool inside fog mode', () => {
    const { container } = render(<DrawingToolbar {...baseProps} editingLayer="fog" />);
    const labels = [...container.querySelectorAll('.drawing-toolbar__tool .drawing-toolbar__tooltip')]
      .map(el => el.textContent);
    expect(labels).not.toContain('Pan & move tokens');
  });
});

describe('fog preview opacity slider', () => {
  const fogProps = { fogGmOpacity: 0.5, onFogGmOpacityChange: () => {} };

  // With a stroke tool, drawing mode shows the brushSize slider alone (the text size slider
  // needs the text controls), so the slider count tells the modes apart without labels.
  it('appears in fog mode only', () => {
    const { container, rerender } = render(
      <DrawingToolbar {...baseProps} {...fogProps} editingLayer="drawing" activeTool="freehand" />
    );
    expect(container.querySelectorAll('input[type="range"]').length).toBe(1);

    rerender(<DrawingToolbar {...baseProps} {...fogProps} editingLayer="fog" activeTool="freehand" />);
    expect(container.querySelectorAll('input[type="range"]').length).toBe(2);
  });

  it('reports a number, not the input string', () => {
    const calls = [];
    const { container } = render(
      <DrawingToolbar
        {...baseProps}
        editingLayer="fog"
        fogGmOpacity={0.5}
        onFogGmOpacityChange={v => calls.push(v)}
      />
    );
    const slider = container.querySelectorAll('input[type="range"]')[1];
    fireEvent.change(slider, { target: { value: '0.3' } });
    expect(calls).toEqual([0.3]);
  });
});

describe('DrawingToolbar text section', () => {
  const style = { fontSize: 24, fontFamily: 'serif', bold: true, italic: false, rotation: 30, textBackdrop: 'outline' };
  const drawing = { ...baseProps, editingLayer: 'drawing', activeTool: 'text' };

  it('is hidden unless the parent asks for it', () => {
    const { container } = render(<DrawingToolbar {...drawing} textStyle={style} onTextStyleChange={() => {}} />);
    expect(container.querySelector('.drawing-toolbar__text')).toBeNull();
  });

  it('shows the style it is given', () => {
    render(<DrawingToolbar {...drawing} showTextControls textStyle={style} onTextStyleChange={() => {}} />);
    expect(screen.getByLabelText(i18n.t('scenes.textFont'))).toHaveValue('serif');
    expect(screen.getByLabelText(i18n.t('scenes.textSize'))).toHaveValue('24');
    expect(screen.getByLabelText(i18n.t('scenes.textRotate'))).toHaveValue('30');
    expect(screen.getByText(i18n.t('scenes.textBold')).closest('button')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(i18n.t('scenes.textBackdrop_outline')).closest('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports each change as a patch', () => {
    const onTextStyleChange = jest.fn();
    render(<DrawingToolbar {...drawing} showTextControls textStyle={style} onTextStyleChange={onTextStyleChange} />);
    fireEvent.change(screen.getByLabelText(i18n.t('scenes.textFont')), { target: { value: 'gothic' } });
    fireEvent.click(screen.getByText(i18n.t('scenes.textBold')).closest('button'));
    fireEvent.click(screen.getByText(i18n.t('scenes.textBackdrop_box')).closest('button'));
    fireEvent.click(screen.getByText(i18n.t('scenes.textRotateReset')).closest('button'));
    expect(onTextStyleChange.mock.calls.map(c => c[0])).toEqual([
      { fontFamily: 'gothic' }, { bold: false }, { textBackdrop: 'box' }, { rotation: 0 },
    ]);
  });

  it('keeps focus on the open label when a style button is pressed', () => {
    render(<DrawingToolbar {...drawing} showTextControls textStyle={style} onTextStyleChange={() => {}} />);
    const bold = screen.getByText(i18n.t('scenes.textBold')).closest('button');
    expect(fireEvent.mouseDown(bold)).toBe(false); // default prevented → no focus change
  });
});

describe('DrawingToolbar size sliders', () => {
  const brush = () => screen.queryByLabelText(i18n.t('scenes.brushSize'));
  const textSize = () => screen.queryByLabelText(i18n.t('scenes.textSize'));
  const style = { fontSize: 16, fontFamily: 'sans', bold: false, italic: false, rotation: 0, textBackdrop: 'none' };

  it('shows only the line width for a stroke tool', () => {
    render(<DrawingToolbar {...baseProps} editingLayer="drawing" activeTool="freehand" textStyle={style} />);
    expect(brush()).not.toBeNull();
    expect(textSize()).toBeNull();
  });

  it('shows only the text size while text controls are up', () => {
    render(<DrawingToolbar {...baseProps} editingLayer="drawing" activeTool="text" showTextControls textStyle={style} onTextStyleChange={() => {}} />);
    expect(brush()).toBeNull();
    expect(textSize()).not.toBeNull();
  });

  it('shows no size slider for the select tool with nothing selected', () => {
    render(<DrawingToolbar {...baseProps} editingLayer="drawing" activeTool="select" textStyle={style} />);
    expect(brush()).toBeNull();
    expect(textSize()).toBeNull();
  });

  it('keeps the brush in fog mode', () => {
    render(<DrawingToolbar {...baseProps} editingLayer="fog" activeTool="freehand" />);
    expect(brush()).not.toBeNull();
  });
});

describe('DrawingToolbar backdrop colour', () => {
  const base = { fontSize: 16, fontFamily: 'sans', bold: false, italic: false, rotation: 0, backdropColor: '' };
  const renderWith = (style, onTextStyleChange = () => {}) => render(
    <DrawingToolbar {...baseProps} editingLayer="drawing" activeTool="text" showTextControls
      textStyle={style} textBackdropColor="#000000" onTextStyleChange={onTextStyleChange} />
  );
  const picker = () => screen.queryByLabelText(i18n.t('scenes.textBackdropColor'));

  it('is hidden while there is no backdrop', () => {
    renderWith({ ...base, textBackdrop: 'none' });
    expect(picker()).toBeNull();
  });

  it('shows the colour actually drawn and reports a pick', () => {
    const onTextStyleChange = jest.fn();
    renderWith({ ...base, textBackdrop: 'box' }, onTextStyleChange);
    expect(picker()).toHaveValue('#000000');
    fireEvent.input(picker(), { target: { value: '#2979ff' } });
    expect(onTextStyleChange).toHaveBeenLastCalledWith({ backdropColor: '#2979ff' });
  });

  it('goes back to automatic', () => {
    const onTextStyleChange = jest.fn();
    renderWith({ ...base, textBackdrop: 'outline', backdropColor: '#2979ff' }, onTextStyleChange);
    const auto = screen.getByText(i18n.t('scenes.textBackdropColorAuto')).closest('button');
    expect(auto).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(auto);
    expect(onTextStyleChange).toHaveBeenLastCalledWith({ backdropColor: '' });
  });
});
