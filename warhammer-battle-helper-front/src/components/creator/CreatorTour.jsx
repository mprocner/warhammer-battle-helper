import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useTour } from '../tutorial/engine/useTour';
import TourRunner from '../tutorial/engine/TourRunner';
import { bodyKeysFor } from '../tutorial/engine/stepResolution';
import { useTutorial } from '../tutorial/TutorialContext';

export const CREATOR_TAB_TOURS = { general: 'creatorGeneral', fields: 'creatorSheet' };
export const creatorSeenKey = (activeTab) => `tutorialSeen:creator:${activeTab === 'fields' ? 'sheet' : 'general'}`;

// The creator's layer over the shared tutorial engine. With nothing requested it runs the active
// tab's tour, auto-started the first time that tab is shown. TemplateBuilder keys it by tab, so a
// tab switch unmounts a running tour with its anchors; the mount effect then drops any tour id the
// context still holds, so the new tab never replays the old tab's tour.
//
// The field tour (creatorField) is only ever started by its "?" and is never remembered. It ends
// when the popup closes or switches to another node (popupKey changes), because its anchors are
// the popup's own groups.
// Scrolls the anchor of the step about to show into the middle of whichever container holds it
// (.creator__general, the property popup body). useTour calls it for every step before it becomes
// current, Next and Back alike, so this does not depend on Joyride finding the scroll parent
// inside the MUI Dialog.
const revealStep = (step) => {
  const el = document.querySelector(step.resolvedTarget);
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'nearest' });
};

function CreatorTour({ activeTab, fieldType, popupKey, onRunningChange }) {
  const { t } = useTranslation();
  const { activeTourId, startCount = 0, clearTour } = useTutorial();
  const tabTourId = CREATOR_TAB_TOURS[activeTab];
  const tourId = activeTourId || tabTourId;
  const isTabTour = tourId === tabTourId;

  const { steps, stepIndex, running, start, goTo, finish } = useTour({
    tourId,
    autoStart: !activeTourId,
    storageKey: isTabTour ? creatorSeenKey(activeTab) : null,
    onFinish: clearTour,
    onReveal: revealStep,
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { clearTour(); }, []);

  // A "?" click raises startCount; react to the change, not to the first render.
  const lastSignal = useRef(startCount);
  useEffect(() => {
    if (startCount === lastSignal.current) return;
    lastSignal.current = startCount;
    start();
  }, [startCount, start]);

  const lastPopup = useRef(popupKey);
  useEffect(() => {
    if (popupKey === lastPopup.current) return;
    lastPopup.current = popupKey;
    if (running && tourId === 'creatorField') finish();
  }, [popupKey, running, tourId, finish]);

  useEffect(() => { if (onRunningChange) onRunningChange(running); }, [running, onRunningChange]);

  const contentFor = useCallback(
    (step) => <p>{t(bodyKeysFor(step, tourId, { targetIndex: step.targetIndex, fieldType }))}</p>,
    [t, tourId, fieldType]
  );

  return (
    <TourRunner tourId={tourId} steps={steps} stepIndex={stepIndex} running={running}
      goTo={goTo} finish={finish} contentFor={contentFor} />
  );
}

// The title-bar "?" of the creator: replays the tutorial of the tab on screen.
export function CreatorTourButton({ tourId }) {
  const { t } = useTranslation();
  const { startTour } = useTutorial();
  const label = t('tutorial.button');
  return (
    <IconButton size="small" className="creator__tour-btn" onClick={() => startTour(tourId)} title={label} aria-label={label}>
      <HelpOutlineIcon fontSize="small" />
    </IconButton>
  );
}

// The "?" in the property popup's title bar: explains the field or section being edited.
export function CreatorFieldTourButton() {
  const { t } = useTranslation();
  const { startTour } = useTutorial();
  const label = t('tutorial.button');
  return (
    <button type="button" className="modal-header__btn creator__field-tour-btn"
      onClick={(e) => { e.stopPropagation(); startTour('creatorField'); }} title={label} aria-label={label}>
      <HelpOutlineIcon style={{ fontSize: 16 }} />
    </button>
  );
}

export default CreatorTour;
