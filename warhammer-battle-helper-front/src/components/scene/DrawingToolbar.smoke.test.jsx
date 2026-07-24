import React from 'react';
import { render, screen } from '@testing-library/react';
import '../../i18n';
import DrawingToolbar from './DrawingToolbar';

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

describe('DrawingToolbar after layer split', () => {
  it('no longer renders the Images (grid) tab', () => {
    render(<DrawingToolbar {...baseProps} />);
    expect(screen.queryByText('Image layers')).toBeNull();
  });

  it('renders the select tab', () => {
    render(<DrawingToolbar {...baseProps} />);
    // select tab tooltip uses scenes.selectLayer = 'Select tokens'
    expect(screen.getByText('Select tokens')).toBeInTheDocument();
  });
});
