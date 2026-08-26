import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackEvent, setPageContext } from './gtag';
import { useConsent } from './ConsentContext';

// Świadome ograniczenie: lobby i sesja gry nie są routami (currentGameId to stan
// w App.js), więc pageview'y pokażą tylko ekrany logowania, rejestracji, ustawień
// i „/". Lejek opiera się na eventach, nie na pageview'ach.
//
// I3: efekt musi zależeć też od consent, nie tylko od pathname. Pierwsze wejście
// nowego odwiedzającego odpala ten efekt, gdy consent jest jeszcze null — trackEvent
// nic wtedy nie wyśle, bo GA jest wyłączone — a kliknięcie „Akceptuję" nie zmienia
// ścieżki, więc bez consent w tablicy zależności efekt nigdy by się nie powtórzył
// i osoba, która zaakceptowała i od razu wyszła, nie wysłałaby ani jednego eventu.
// Brak duplikatu na ścieżce „zgoda już zapisana przy starcie" wynika z kolejności
// montowania w App.js: AnalyticsGate renderuje się przed <Router>, więc jego efekt
// (enable()) commituje się, zanim ten efekt w PageViewTracker w ogóle się odpali.
export const usePageViews = () => {
    const { pathname } = useLocation();
    const { consent } = useConsent();

    useEffect(() => {
        // SPA navigation nie przeładowuje dokumentu, więc gtag('set') z enable()
        // trzyma wartości sprzed nawigacji — trzeba je odświeżyć przed każdym eventem.
        setPageContext();
        trackEvent('page_view', { page_path: pathname });
    }, [pathname, consent]);
};

export default usePageViews;
