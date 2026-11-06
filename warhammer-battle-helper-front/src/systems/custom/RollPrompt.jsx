import React from 'react';
import RollModifierOverlay from './RollModifierOverlay';
import EdgeDiceOverlay from './EdgeDiceOverlay';
import { MOD_KIND_DICE } from './modifierConfig';

// RollPrompt picks the pre-roll prompt by the template's modifier kind. Both custom cards
// (CharacterSheet, CharacterDetails) render this one switch instead of each choosing.
function RollPrompt({ pending, pos, config, onConfirm, onCancel }) {
  if (!pending || !config) return null;
  if (config.kind === MOD_KIND_DICE) {
    return <EdgeDiceOverlay pos={pos} config={config} onSelect={onConfirm} onCancel={onCancel} />;
  }
  return <RollModifierOverlay label={pending.label} config={config} onConfirm={onConfirm} onCancel={onCancel} />;
}

export default RollPrompt;
