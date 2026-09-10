import React from 'react';
import { useTranslation } from 'react-i18next';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { getTour } from './tours';
import { useTutorial } from './TutorialContext';
import './TourButton.css';

// Jedyny element, jaki zakładki wstawiają u siebie. Nieznane tourId nie wywala
// panelu — przycisk po prostu się nie renderuje.
const TourButton = ({ tourId }) => {
  const { t } = useTranslation();
  const { startTour } = useTutorial();

  if (!getTour(tourId)) return null;

  const label = t('tutorial.button');

  return (
    <button
      type="button"
      className="tour-button"
      onClick={() => startTour(tourId)}
      title={label}
      aria-label={label}
    >
      <HelpOutlineIcon fontSize="small" />
    </button>
  );
};

export default TourButton;
