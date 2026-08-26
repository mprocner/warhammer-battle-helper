import React, {
    createContext, useCallback, useContext, useEffect, useState,
} from 'react';

export const CONSENT_STORAGE_KEY = 'analytics-consent';
export const CONSENT_GRANTED = 'granted';
export const CONSENT_DENIED = 'denied';

const ConsentContext = createContext(null);

// localStorage rzuca w trybie prywatnym niektórych przeglądarek — brak zapisu
// oznacza po prostu, że baner pokaże się ponownie, a nie że aplikacja ma paść.
const readStored = () => {
    try {
        const value = localStorage.getItem(CONSENT_STORAGE_KEY);
        return value === CONSENT_GRANTED || value === CONSENT_DENIED ? value : null;
    } catch (e) {
        return null;
    }
};

const writeStored = (value) => {
    try {
        localStorage.setItem(CONSENT_STORAGE_KEY, value);
    } catch (e) {
        // Decyzja żyje wtedy tylko do końca sesji.
    }
};

export const ConsentProvider = ({ children }) => {
    const [consent, setConsent] = useState(readStored);

    const decide = useCallback((value) => {
        writeStored(value);
        setConsent(value);
    }, []);

    const grant = useCallback(() => decide(CONSENT_GRANTED), [decide]);
    const deny = useCallback(() => decide(CONSENT_DENIED), [decide]);

    // Bez tego wycofanie zgody w jednej karcie zostawia inne otwarte karty w pełni
    // zinstrumentowane aż do odświeżenia — event 'storage' odpala się tylko
    // w kartach INNYCH niż ta, która zapisała localStorage, więc nie ma tu pętli.
    useEffect(() => {
        const onStorage = (e) => {
            if (e.key === CONSENT_STORAGE_KEY) setConsent(readStored());
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    return (
        <ConsentContext.Provider value={{ consent, grant, deny }}>
            {children}
        </ConsentContext.Provider>
    );
};

export const useConsent = () => {
    const ctx = useContext(ConsentContext);
    if (!ctx) throw new Error('useConsent must be used inside a ConsentProvider');
    return ctx;
};
