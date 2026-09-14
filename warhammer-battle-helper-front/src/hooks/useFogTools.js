import { useState } from 'react';

/**
 * Manages fog-of-war toolbar UI state: active editing layer, cover vs reveal mode.
 * Also holds imageEditLayer — which image layer (background/tokens/gm) is armed for
 * editing via the Select/Move tool. Persists across mode/scene switches.
 */
export function useFogTools() {
  // editingLayer is never null — Select is the default tool (see sceneModes.js).
  const [editingLayer, setEditingLayer] = useState('select');
  const [fogCoverMode, setFogCoverMode] = useState(false);
  // Tokens is the armed layer at start: Select needs it armed to manipulate character tokens at
  // all, so any other default would leave the GM unable to move a token until they touched the
  // layer bar.
  const [imageEditLayer, setImageEditLayer] = useState('tokens');

  return {
    editingLayer,
    setEditingLayer,
    fogCoverMode,
    setFogCoverMode,
    imageEditLayer,
    setImageEditLayer,
  };
}
