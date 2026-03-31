import { useState } from 'react';

/**
 * Manages drawing toolbar UI state: active tool, brush size, color, font size.
 */
export function useDrawingTools() {
  const [activeTool, setActiveTool] = useState('freehand');
  const [brushSize, setBrushSize] = useState(10);
  const [drawingColor, setDrawingColor] = useState('#ff0000');
  const [drawingFontSize, setDrawingFontSize] = useState(16);

  return {
    activeTool,
    setActiveTool,
    brushSize,
    setBrushSize,
    drawingColor,
    setDrawingColor,
    drawingFontSize,
    setDrawingFontSize,
  };
}
