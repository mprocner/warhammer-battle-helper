import { useEffect } from 'react';
import { useConsent, CONSENT_GRANTED } from './ConsentContext';
import { enable, disable } from './gtag';

// Jedyny punkt styku między decyzją użytkownika a Google Analytics.
// ConsentContext celowo nie wie o GA — kolejny skrypt third-party dopina się tutaj,
// jako drugi subskrybent, bez przebudowy kontekstu.
const AnalyticsGate = () => {
    const { consent } = useConsent();

    useEffect(() => {
        if (consent === CONSENT_GRANTED) enable();
        else disable();
    }, [consent]);

    return null;
};

export default AnalyticsGate;
