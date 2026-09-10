import React from 'react';
import { useTranslation } from 'react-i18next';
import { tabsForRole } from '../panels/tabDefinitions';

// Ikony i kolejność biorą się z tej samej definicji co realne zakładki panelu,
// więc legenda nie może pokazać zakładki, której user nie ma.
const TabsLegend = ({ isGM }) => {
  const { t } = useTranslation();

  return (
    <div className="tour-tabs-legend">
      <p className="tour-tabs-legend__intro">{t('tutorial.tabsIntro')}</p>
      <ul className="tour-tabs-legend__list">
        {tabsForRole(isGM).map(({ id, Icon }) => (
          <li key={id} className="tour-tabs-legend__item">
            <Icon className="tour-tabs-legend__icon" fontSize="small" />
            <span className="tour-tabs-legend__name">{t(`rightPanel.tabs.${id}`)}</span>
            <span className="tour-tabs-legend__desc">{t(`tutorial.tabs.${id}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TabsLegend;
