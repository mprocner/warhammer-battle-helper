import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import {
  DndContext as DndKitContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Default dice shown under the chat — mirrors DiceRollControls' fallback set.
export const DEFAULT_DICE = [4, 6, 8, 10, 12, 20, 100];
const PRESET_DICE = [4, 6, 8, 10, 12, 20, 100];
const MAX_DICE = 7;
const MAX_SIDES = 1000;

// DieChip is a sortable chip. The whole chip is the drag handle — chips are too
// small to justify a separate grab zone — so the remove button lives inside a
// draggable node. The sensor's distance constraint is what keeps its click
// working: a press that never moves 5px never becomes a drag.
function DieChip({ sides, onRemove }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: String(sides) });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`dcb__chip${isDragging ? ' dcb__chip--dragging' : ''}`}
      {...attributes}
      {...listeners}
    >
      <DragIndicatorIcon className="dcb__chip-grip" style={{ fontSize: 13 }} />
      <span className="dcb__chip-label">{t('dice.label', { sides })}</span>
      <button
        className="dcb__chip-remove"
        onClick={onRemove}
        title={t('dice.removeDie')}
        aria-label={t('dice.removeDie')}
      >
        ✕
      </button>
    </div>
  );
}

// DiceConfigBuilder lets a GM pick which dice buttons appear under the chat.
// Visual grammar mirrors FormulaBuilder: a track of draggable, removable chips,
// a preset row, and a custom-value input.
function DiceConfigBuilder({ dice, onChange }) {
  const { t } = useTranslation();
  const [customDraft, setCustomDraft] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const list = dice || [];
  const isFull = list.length >= MAX_DICE;

  const addDie = (sides) => {
    if (isFull || list.includes(sides)) return;
    onChange([...list, sides]);
  };

  const removeDie = (idx) => onChange(list.filter((_, i) => i !== idx));

  // Chip ids are the side counts themselves — dice are unique by construction
  // (addDie/addCustom reject duplicates), so no surrogate id is needed.
  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIdx = list.findIndex(s => String(s) === active.id);
    const newIdx = list.findIndex(s => String(s) === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    onChange(arrayMove(list, oldIdx, newIdx));
  };

  const reset = () => onChange([...DEFAULT_DICE]);

  const parsedCustom = parseInt(customDraft, 10);
  const customValid =
    !isNaN(parsedCustom) &&
    parsedCustom >= 2 &&
    parsedCustom <= MAX_SIDES &&
    !list.includes(parsedCustom) &&
    !isFull;

  const addCustom = () => {
    if (!customValid) return;
    onChange([...list, parsedCustom]);
    setCustomDraft('');
  };

  return (
    <div className="dcb__root">

      {/* ── Active dice track ───────────────────────────────────────────── */}
      <div className="dcb__track">
        <div className="dcb__track-header">
          <span className="dcb__track-label">{t('dice.trackLabel')}</span>
          <button className="dcb__reset" onClick={reset}>
            <RestartAltIcon style={{ fontSize: 14 }} /> {t('dice.resetDefault')}
          </button>
        </div>

        <div className="dcb__track-body">
          {list.length === 0 ? (
            <span className="dcb__track-empty">{t('dice.trackEmpty')}</span>
          ) : (
            <DndKitContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={list.map(String)} strategy={rectSortingStrategy}>
                {list.map((sides, idx) => (
                  <DieChip key={sides} sides={sides} onRemove={() => removeDie(idx)} />
                ))}
              </SortableContext>
            </DndKitContext>
          )}
        </div>

        {list.length > 1 && <div className="dcb__track-hint">{t('dice.reorderHint')}</div>}

        {isFull && (
          <div className="dcb__track-hint">
            {t('dice.maxReachedHint', { count: list.length, max: MAX_DICE })}
          </div>
        )}
      </div>

      {/* ── Presets ─────────────────────────────────────────────────────── */}
      <div className="dcb__section">
        <div className="dcb__section-header">
          <span className="dcb__section-title">{t('dice.presetsLabel')}</span>
        </div>
        <div className="dcb__section-body">
          <div className="dcb__preset-row">
            {PRESET_DICE.map(sides => (
              <button
                key={sides}
                className="dcb__preset-btn"
                onClick={() => addDie(sides)}
                disabled={isFull || list.includes(sides)}
              >
                {t('dice.label', { sides })}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Custom die ──────────────────────────────────────────────────── */}
      <div className="dcb__section">
        <div className="dcb__section-header">
          <span className="dcb__section-title">{t('dice.customLabel')}</span>
        </div>
        <div className="dcb__section-body">
          <div className="dcb__custom-row">
            <span className="dcb__custom-notation">{t('dice.dieNotation')}</span>
            <input
              type="number"
              min={2}
              max={MAX_SIDES}
              className="dcb__custom-input"
              value={customDraft}
              onChange={e => setCustomDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCustom(); }}
              placeholder="3"
              disabled={isFull}
            />
            <button className="dcb__custom-add" onClick={addCustom} disabled={!customValid}>
              {t('dice.addCustom', { sides: parsedCustom > 0 ? parsedCustom : '' })}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

export default DiceConfigBuilder;
