import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConsent } from '../../analytics/ConsentContext';
import { isConfigured } from '../../analytics/gtag';
import './ConsentBanner.css';

const ConsentBanner = () => {
    const { t } = useTranslation();
    const { consent, grant, deny } = useConsent();

    // Bez measurement ID nie ma czego akceptować — baner nie ma prawa się pokazać
    // w dev ani w buildzie bez skonfigurowanego GA.
    if (!isConfigured() || consent !== null) return null;

    return (
        <div className="consent-banner" role="dialog" aria-label={t('consent.title')}>
            <div className="consent-banner__text">
                <strong className="consent-banner__title">{t('consent.title')}</strong>
                <span>{t('consent.message')}</span>
                <Link className="consent-banner__link" to="/privacy">
                    {t('consent.privacyLink')}
                </Link>
            </div>
            <div className="consent-banner__actions">
                {/* Oba przyciski mają identyczny styl — RODO wymaga, żeby odmowa
                    była tak samo łatwa jak zgoda. To nie jest decyzja estetyczna. */}
                <button type="button" className="consent-banner__button" onClick={deny}>
                    {t('consent.decline')}
                </button>
                <button type="button" className="consent-banner__button" onClick={grant}>
                    {t('consent.accept')}
                </button>
            </div>
        </div>
    );
};

export default ConsentBanner;
