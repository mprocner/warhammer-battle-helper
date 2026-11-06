import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// The only place that decides between the guest and the logged-in call to action.
const LandingCta = ({ user }) => {
    const { t } = useTranslation();

    return user ? (
        <Link to="/games" className="landing__cta">{t('landing.cta.games')}</Link>
    ) : (
        <Link to="/register" className="landing__cta">{t('landing.cta.register')}</Link>
    );
};

export default LandingCta;
