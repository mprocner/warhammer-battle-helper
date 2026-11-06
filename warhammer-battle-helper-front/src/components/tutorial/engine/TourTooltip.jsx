import React from 'react';
import { useTranslation } from 'react-i18next';
import { MenuBook as MenuBookIcon } from '@mui/icons-material';
import './GameTour.css';

// Kształt propsów narzuca react-joyride (tooltipComponent). Renderujemy własny
// markup, żeby dymek trzymał paletę kart postaci zamiast domyślnych kolorów biblioteki.
const TourTooltip = ({
  index,
  size,
  step,
  isLastStep,
  tooltipProps,
  backProps,
  primaryProps,
  skipProps,
}) => {
  const { t } = useTranslation();

  return (
    <div className="tour-tooltip" {...tooltipProps}>
      {step.title && <h3 className="tour-tooltip__title">{step.title}</h3>}
      <div className="tour-tooltip__body">{step.content}</div>
      {/* A new tab, so following the link never ends the tour or leaves the game. */}
      {step.data?.helpHref && (
        <a
          className="tour-tooltip__help-link"
          href={step.data.helpHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MenuBookIcon fontSize="inherit" />
          {t('tutorial.moreInHelp')}
        </a>
      )}
      <div className="tour-tooltip__footer">
        <span className="tour-tooltip__progress">
          {t('tutorial.progress', { current: index + 1, total: size })}
        </span>
        <div className="tour-tooltip__actions">
          <button type="button" className="tour-tooltip__btn tour-tooltip__btn--ghost" {...skipProps}>
            {t('tutorial.skip')}
          </button>
          {index > 0 && (
            <button type="button" className="tour-tooltip__btn" {...backProps}>
              {t('tutorial.back')}
            </button>
          )}
          <button type="button" className="tour-tooltip__btn tour-tooltip__btn--primary" {...primaryProps}>
            {isLastStep ? t('tutorial.done') : t('tutorial.next')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TourTooltip;
