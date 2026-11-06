import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// The public pages every screen must reach: legal documents, contact, changelog and help.
// Labels are `navigation.<key>`. The game room lists the same links (GeneralTab), opening them
// in a new tab so following one does not drop the player out of the session.
export const SITE_LINKS = [
    { key: 'terms', to: '/terms' },
    { key: 'privacy', to: '/privacy' },
    { key: 'licenses', to: '/licenses' },
    { key: 'contact', to: '/contact' },
    { key: 'changelog', to: '/changelog' },
    { key: 'help', to: '/help' },
];

// App renders it under every page except the game room and the standalone character sheet.
const SiteFooter = () => {
    const { t } = useTranslation();

    return (
        <footer className="site-footer">
            <nav className="site-footer__nav" aria-label={t('footer.label')}>
                {SITE_LINKS.map(({ key, to }) => (
                    <Link key={key} to={to} className="site-footer__link">
                        {t(`navigation.${key}`)}
                    </Link>
                ))}
            </nav>
        </footer>
    );
};

export default SiteFooter;
