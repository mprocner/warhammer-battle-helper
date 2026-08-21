import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '../../i18n';
import DrawingToolbar from './DrawingToolbar';
import { modesForRole } from './sceneModes';

const baseProps = {
  editingLayer: null,
  onEditingLayerChange: () => {},
  activeTool: 'select',
  onActiveToolChange: () => {},
  brushSize: 10,
  onBrushSizeChange: () => {},
  drawingColor: '#ff0000',
  onDrawingColorChange: () => {},
  drawingFontSize: 16,
  onDrawingFontSizeChange: () => {},
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
    expect(labels).not.toContain('Select tokens');
    expect(labels).not.toContain('Fog of War');
  });

  it('marks only the active mode tab with aria-pressed', () => {
    const modes = modesForRole(true);
    const activeMode = modes[1]; // any non-pan mode, so both true and false cases show up
    const { container } = render(
      <DrawingToolbar {...baseProps} editingLayer={activeMode.value} />
    );
    const tabs = [...container.querySelectorAll('.drawing-toolbar__tab')];
    tabs.forEach((tab, i) => {
      expect(tab).toHaveAttribute('aria-pressed', String(modes[i].value === activeMode.value));
    });
  });

  it('clicking the active tab returns to pan', () => {
    const calls = [];
    render(
      <DrawingToolbar
        {...baseProps}
        editingLayer="fog"
        onEditingLayerChange={v => calls.push(v)}
      />
    );
    fireEvent.click(screen.getByText('Fog of War').closest('button'));
    expect(calls).toEqual([null]);
  });

  it('clicking an inactive tab selects it', () => {
    const calls = [];
    render(
      <DrawingToolbar
        {...baseProps}
        editingLayer={null}
        onEditingLayerChange={v => calls.push(v)}
      />
    );
    fireEvent.click(screen.getByText('Fog of War').closest('button'));
    expect(calls).toEqual(['fog']);
  });
});
