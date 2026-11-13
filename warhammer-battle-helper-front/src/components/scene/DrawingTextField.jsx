import React, { useEffect, useRef } from 'react';
import { ensureTextFont, measureTextBox, textFontCss, textLines, LINE_HEIGHT } from './drawingText';

// The open edit field of the text tool, standing exactly where the label is (or will be) drawn:
// same anchor, font, line height and rotation as DrawingLayer's drawText, so committing does not
// make the text jump. Enter saves, Shift+Enter adds a line, Escape throws the edit away.
//
// textInput is the useDrawingTextInput session (owned by DndContext, shared with the toolbar).
export default function DrawingTextField({ textInput }) {
  const ref = useRef(null);
  const { pos, value, style } = textInput;

  // Editing an existing label: caret at the end, not the start, of what is already there.
  useEffect(() => {
    const el = ref.current;
    if (el) el.setSelectionRange(el.value.length, el.value.length);
  }, [pos]);

  // A <textarea> renders the face through CSS, which only knows it after the lazy import.
  useEffect(() => { if (style) ensureTextFont(style); }, [style]);

  if (!pos) return null;

  const fontSize = style.fontSize;
  // Room for the caret past the widest line, so typing never wraps or scrolls the field.
  const { width } = measureTextBox({ ...style, text: value });
  const lines = textLines(value).length;

  return (
    <textarea
      ref={ref}
      autoFocus
      className="drawing-text-field"
      value={value}
      rows={lines}
      wrap="off"
      spellCheck={false}
      onChange={e => textInput.setValue(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          textInput.commit();
        }
        if (e.key === 'Escape') textInput.cancel();
      }}
      // Focus moving into the drawing toolbar (font select, size slider) is styling this very
      // label, so it must not save and close it. Anything else — another panel, another window —
      // saves, as before (FEATURE-121). Toolbar buttons never take focus (mousedown is
      // prevented there), so only the select and the sliders get here.
      onBlur={e => {
        if (e.relatedTarget?.closest?.('.drawing-toolbar')) return;
        textInput.commit();
      }}
      style={{
        left: pos[0],
        top: pos[1],
        width: Math.max(width, fontSize * 3) + fontSize,
        height: lines * fontSize * LINE_HEIGHT,
        transform: `rotate(${style.rotation || 0}deg)`,
        font: textFontCss(style),
        lineHeight: LINE_HEIGHT,
        color: style.color,
        outlineColor: style.color,
      }}
    />
  );
}
