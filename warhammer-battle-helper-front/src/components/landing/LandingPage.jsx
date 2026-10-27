import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import MapIcon from '@mui/icons-material/Map';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import LandingCta from './LandingCta';

const HERO_IMAGE = '/img/landing/hero.webp';

const FEATURES = [
    { key: 'scene', Icon: MapIcon, image: '/img/landing/scene.webp' },
    { key: 'creator', Icon: DashboardCustomizeIcon, image: '/img/landing/creator.webp' },
    { key: 'gmTools', Icon: AutoStoriesIcon, image: '/img/landing/gm-tools.webp' },
];

const LandingPage = ({ user }) => {
    const { t } = useTranslation();
    const featuresRef = useRef(null);

    return (
        <div className="landing">
            {/* The image goes through a custom property: CRA's css-loader would try to
                resolve a root-relative url() in style.css as a module and fail the build. */}
            <section className="landing__hero" style={{ '--landing-hero-image': `url(${HERO_IMAGE})` }}>
                <div className="landing__hero-content">
                    <h1 className="landing__hero-title">{t('landing.hero.title')}</h1>
                    <p className="landing__hero-subtitle">{t('landing.hero.subtitle')}</p>
                    <div className="landing__hero-actions">
                        <LandingCta user={user} />
                        <button
                            type="button"
                            className="landing__cta-secondary"
                            onClick={() => featuresRef.current.scrollIntoView({ behavior: 'smooth' })}
                        >
                            {t('landing.cta.features')}
                        </button>
                    </div>
                </div>
            </section>

            <section className="landing__features" ref={featuresRef}>
                {FEATURES.map(({ key, Icon, image }, index) => (
                    <article
                        key={key}
                        className={`landing__feature${index % 2 === 1 ? ' landing__feature--reversed' : ''}`}
                    >
                        <div className="landing__feature-text">
                            <h2 className="landing__feature-title">
                                <Icon className="landing__feature-icon" />
                                {t(`landing.features.${key}.title`)}
                            </h2>
                            <p className="landing__feature-body">{t(`landing.features.${key}.body`)}</p>
                        </div>
                        <div className="landing__feature-media">
                            <img
                                className="landing__feature-image"
                                src={image}
                                alt={t(`landing.features.${key}.imageAlt`)}
                                loading="lazy"
                            />
                        </div>
                    </article>
                ))}
            </section>

            <section className="landing__cta-band">
                <h2 className="landing__cta-band-title">{t('landing.ctaBand.title')}</h2>
                <LandingCta user={user} />
            </section>
        </div>
    );
};

export default LandingPage;
