import React from 'react';
import { useTranslation } from 'react-i18next';

const LOCATIONS = [
    { key: 'head', className: 'armour-input--head', range: '01-09' },
    { key: 'leftArm', className: 'armour-input--left-arm', range: '10-24' },
    { key: 'rightArm', className: 'armour-input--right-arm', range: '25-44' },
    { key: 'body', className: 'armour-input--body', range: '45-79', labelKey: 'bodyLocation' },
    { key: 'leftLeg', className: 'armour-input--left-leg', range: '80-89' },
    { key: 'rightLeg', className: 'armour-input--right-leg', range: '90-100' },
    { key: 'shield', className: 'armour-input--shield', range: null },
];

const ArmourPointsSection = ({ armourPoints, onFieldChange }) => {
    const { t } = useTranslation();

    return (
        <div className="card-section">
            <h3>{t('characterSheet.armourPoints')}</h3>
            <div className="armour-points-container">
                <img src="/img/knight.png" alt="Knight silhouette" className="knight-silhouette" />
                {LOCATIONS.map(({ key, className, range, labelKey }) => (
                    <div key={key} className={`armour-input ${className}`}>
                        <label>{t(`characterSheet.${labelKey || key}`)}</label>
                        {range && <span className="hit-range">{range}</span>}
                        <input
                            type="number"
                            min="0"
                            value={armourPoints?.[key] || 0}
                            onChange={(e) => onFieldChange(`armourPoints.${key}`, e.target.value)}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ArmourPointsSection;
