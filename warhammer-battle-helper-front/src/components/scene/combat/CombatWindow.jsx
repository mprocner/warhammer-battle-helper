import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ReplayIcon from '@mui/icons-material/Replay';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import DraggablePopup from '../../common/DraggablePopup';
import { usePortalTooltip } from '../../common/PortalTooltip';
import ConfirmModal from '../../common/ConfirmModal';
import SortableList from '../../common/sortable/SortableList';
import useSortableItem from '../../common/sortable/useSortableItem';
import DragGrip from '../../common/sortable/DragGrip';
import { useCombat, COMBAT_WINDOW_ID } from '../../../contexts/CombatContext';
import {
  activateCombatEntry, updateCombatEntry, removeCombatEntry, reorderCombat, nextTurn, endRound,
  endCombat, setCombatVisibility, addCombatEntries,
} from '../../../api/combat';
import { allActed, combatCandidates, characterCandidates } from './combatSelectors';
import CombatPortrait from './CombatPortrait';
import './combat.css';

function CombatRow({ entry, isActive, tip }) {
  const { t } = useTranslation();
  const { gameId, sceneId, run } = useCombat();
  const { rootProps, gripProps, isDragging } = useSortableItem(entry.id);
  const [value, setValue] = useState(String(entry.initiative ?? 0));
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(entry.name);
  // Escape must win over the blur the browser fires while the input unmounts: that blur still sees
  // the typed name, so without this flag it would commit the rename Escape just cancelled.
  const cancelledRef = useRef(false);
  useEffect(() => setValue(String(entry.initiative ?? 0)), [entry.initiative]);
  useEffect(() => setName(entry.name), [entry.name]);

  const patch = (body) => run(() => updateCombatEntry(gameId, sceneId, entry.id, body));
  const commitValue = () => {
    const n = parseInt(value, 10);
    if (Number.isNaN(n) || n === entry.initiative) {
      setValue(String(entry.initiative ?? 0));
      return;
    }
    patch({ initiative: n });
  };
  const commitName = () => {
    setRenaming(false);
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setName(entry.name);
      return;
    }
    const n = name.trim();
    if (!n || n === entry.name) {
      setName(entry.name);
      return;
    }
    patch({ name: n });
  };

  let cls = 'combat-row';
  if (isActive) cls += ' combat-row--active';
  if (entry.acted) cls += ' combat-row--acted';
  if (isDragging) cls += ' combat-row--dragging';

  return (
    <li {...rootProps} className={cls}>
      <DragGrip {...gripProps} label={t('combat.window.drag')} />
      <CombatPortrait entry={entry} small />
      {renaming ? (
        <input
          autoFocus
          className="combat-row__name-input"
          value={name}
          maxLength={60}
          onChange={e => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { cancelledRef.current = true; setName(entry.name); setRenaming(false); } }}
          aria-label={t('combat.window.rename')}
        />
      ) : (
        <button type="button" className="combat-row__name" onClick={() => run(() => activateCombatEntry(gameId, sceneId, entry.id))}>
          {entry.name}
        </button>
      )}
      {entry.kind !== 'character' && entry.kind !== 'gameCharacter' && !renaming && (
        <button type="button" className="combat-row__icon" onClick={() => { cancelledRef.current = false; setRenaming(true); }} aria-label={t('combat.window.rename')} {...tip(t('combat.window.rename'))}>
          <EditIcon style={{ fontSize: 14 }} />
        </button>
      )}
      <input
        type="number"
        className="combat-row__value"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={commitValue}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        aria-label={t('combat.window.initiative')}
      />
      <button
        type="button"
        className="combat-row__icon"
        aria-pressed={entry.acted}
        onClick={() => patch({ acted: !entry.acted })}
        aria-label={t('combat.window.acted')}
        {...tip(t(entry.acted ? 'combat.window.actedUnmark' : 'combat.window.actedMark'))}
      >
        {entry.acted ? <CheckCircleIcon style={{ fontSize: 16 }} /> : <RadioButtonUncheckedIcon style={{ fontSize: 16 }} />}
      </button>
      <button
        type="button"
        className="combat-row__icon"
        onClick={() => patch({ hidden: !entry.hidden })}
        aria-label={t(entry.hidden ? 'combat.window.entryShow' : 'combat.window.entryHide')}
        {...tip(t(entry.hidden ? 'combat.window.entryHiddenTip' : 'combat.window.entryVisibleTip'))}
      >
        {entry.hidden ? <VisibilityOffIcon style={{ fontSize: 16 }} /> : <VisibilityIcon style={{ fontSize: 16 }} />}
      </button>
      <button
        type="button"
        className="combat-row__icon combat-row__icon--remove"
        onClick={() => run(() => removeCombatEntry(gameId, sceneId, entry.id))}
        aria-label={t('combat.window.remove')}
        {...tip(t('combat.window.remove'))}
      >
        <CloseIcon style={{ fontSize: 16 }} />
      </button>
    </li>
  );
}

function CandidateList({ candidates }) {
  const { gameId, sceneId, run } = useCombat();
  return (
    <ul className="combat-window__candidates">
      {candidates.map(c => (
        <li key={`${c.kind}:${c.sourceId}`}>
          <button type="button" className="combat-window__candidate" onClick={() => run(() => addCombatEntries(gameId, sceneId, [{ kind: c.kind, sourceId: c.sourceId }]))}>
            <CombatPortrait entry={c} small />
            {c.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

// Three ways in: tokens on this scene, any character from the GM's character list (placed or not),
// and a manual entry.
function CombatAddPanel({ characters }) {
  const { t } = useTranslation();
  const { gameId, sceneId, scene, combat, run } = useCombat();
  const [name, setName] = useState('');
  const [initiative, setInitiative] = useState('0');
  const candidates = combatCandidates(scene, combat);
  const listed = characterCandidates(characters, scene, combat);

  const addManual = (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    run(() => addCombatEntries(gameId, sceneId, [{ kind: 'manual', name: n, initiative: parseInt(initiative, 10) || 0 }]));
    setName('');
    setInitiative('0');
  };

  return (
    <div className="combat-window__add">
      <div className="combat-window__add-label">{t('combat.window.addFromScene')}</div>
      {candidates.length === 0 && <p className="combat-window__hint">{t('combat.window.noCandidates')}</p>}
      <CandidateList candidates={candidates} />
      <div className="combat-window__add-label">{t('combat.window.addFromList')}</div>
      {listed.length === 0 && <p className="combat-window__hint">{t('combat.window.noListCandidates')}</p>}
      <CandidateList candidates={listed} />
      <div className="combat-window__add-label">{t('combat.window.addManualLabel')}</div>
      <form className="combat-window__manual" onSubmit={addManual}>
        <input value={name} maxLength={60} onChange={e => setName(e.target.value)} aria-label={t('combat.window.manualName')} placeholder={t('combat.window.manualName')} />
        <input type="number" className="combat-row__value" value={initiative} onChange={e => setInitiative(e.target.value)} aria-label={t('combat.window.initiative')} />
        <button type="submit" className="combat-window__btn">{t('combat.window.addManual')}</button>
      </form>
    </div>
  );
}

// GM's management window. Lives in the Window Manager, so it moves, minimises to the window bar and
// closes like a character sheet.
export default function CombatWindow({ characters = [] }) {
  const { t } = useTranslation();
  const { combat, isGM, windowOpen, setWindowOpen, gameId, sceneId, run } = useCombat();
  const [adding, setAdding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  // One tooltip for the whole window; rows get hover handlers through tip().
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();
  if (!isGM || !windowOpen || !combat) return null;

  const roundDone = allActed(combat);
  const noEntries = combat.entries.length === 0;
  const tip = (text) => ({ onMouseEnter: e => showTooltip(text, e.currentTarget), onMouseLeave: hideTooltip });

  return (
    <DraggablePopup
      title={t('combat.window.title', { round: combat.round })}
      onClose={() => setWindowOpen(false)}
      windowId={COMBAT_WINDOW_ID}
      windowKind="combat"
      initialWidth={460}
      initialHeight={480}
      className="combat-window"
    >
      <div className="combat-window__body">
        {noEntries && <p className="combat-window__hint">{t('combat.window.empty')}</p>}
        <SortableList items={combat.entries} onReorder={next => run(() => reorderCombat(gameId, sceneId, next.map(e => e.id)))}>
          <ol className="combat-window__list">
            {combat.entries.map(e => <CombatRow key={e.id} entry={e} isActive={e.id === combat.activeId} tip={tip} />)}
          </ol>
        </SortableList>
        <div className="combat-window__footer">
          {/* The turn itself: the suggested next step is the filled button. */}
          <div className="combat-window__turn">
            <button
              type="button"
              className={`combat-window__btn combat-window__btn--turn${roundDone ? '' : ' combat-window__btn--primary'}`}
              disabled={noEntries}
              onClick={() => run(() => nextTurn(gameId, sceneId, combat.activeId))}
            >
              {t('combat.next')} <ArrowForwardIcon style={{ fontSize: 16 }} />
            </button>
            <button
              type="button"
              className={`combat-window__btn combat-window__btn--turn${roundDone ? ' combat-window__btn--primary' : ''}`}
              disabled={noEntries}
              onClick={() => run(() => endRound(gameId, sceneId))}
            >
              <ReplayIcon style={{ fontSize: 16 }} /> {t('combat.endRound')}
            </button>
          </div>
          {/* Managing the combat: quieter, the destructive action kept apart on the right. */}
          <div className="combat-window__manage">
            <button
              type="button"
              className="combat-window__btn combat-window__btn--tool"
              aria-pressed={adding}
              onClick={() => setAdding(v => !v)}
              {...tip(t('combat.window.addTip'))}
            >
              <AddIcon style={{ fontSize: 16 }} /> {t('combat.window.add')}
            </button>
            <button
              type="button"
              className="combat-window__btn combat-window__btn--tool"
              onClick={() => run(() => setCombatVisibility(gameId, sceneId, !combat.visibleToPlayers))}
              {...tip(t(combat.visibleToPlayers ? 'combat.window.hideTip' : 'combat.window.showTip'))}
            >
              {combat.visibleToPlayers ? <VisibilityOffIcon style={{ fontSize: 16 }} /> : <VisibilityIcon style={{ fontSize: 16 }} />}
              {' '}{t(combat.visibleToPlayers ? 'combat.window.hideShort' : 'combat.window.showShort')}
            </button>
            <button
              type="button"
              className="combat-window__btn combat-window__btn--tool combat-window__btn--danger"
              onClick={() => setConfirmEnd(true)}
              {...tip(t('combat.window.endCombatTip'))}
            >
              <StopCircleOutlinedIcon style={{ fontSize: 16 }} /> {t('combat.window.endCombat')}
            </button>
          </div>
        </div>
        {(adding || noEntries) && <CombatAddPanel characters={characters} />}
      </div>
      {tooltipNode}
      <ConfirmModal
        isOpen={confirmEnd}
        message={t('combat.window.endCombatConfirm')}
        confirmLabel={t('combat.window.endCombat')}
        onConfirm={() => { setConfirmEnd(false); run(() => endCombat(gameId, sceneId)); }}
        onCancel={() => setConfirmEnd(false)}
      />
    </DraggablePopup>
  );
}
