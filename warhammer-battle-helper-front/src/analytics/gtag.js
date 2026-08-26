// Jedyne miejsce w aplikacji, które zna window.gtag / window.dataLayer.
//
// Dlaczego wstrzykujemy skrypt ręcznie zamiast wpisać <script> do index.html:
// gtag.js już przy samym załadowaniu wysyła żądanie do Google (a więc IP użytkownika,
// czyli dane osobowe) i zapisuje cookie _ga. Statycznego tagu nie da się pogodzić
// ze zgodą — jedyny punkt kontroli to decyzja, czy w ogóle go wstrzyknąć.

const MEASUREMENT_ID = process.env.REACT_APP_GA_MEASUREMENT_ID || '';

let injected = false;
let enabled = false;
let currentUserId = null;

export const isConfigured = () => Boolean(MEASUREMENT_ID);

// Dokładnie ta forma co w oficjalnym snippecie Google: gtag.js czyta z dataLayer
// obiekty `arguments`, nie zwykłe tablice.
function gtag() {
    window.dataLayer = window.dataLayer || [];
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
}

// GA4 zapisuje _ga na najwyższej rejestrowalnej domenie (np. .playrpg.net), nie na
// pełnym hostname. Na www.playrpg.net domain=.www.playrpg.net niczego nie dopasuje,
// więc trzeba spróbować skasować cookie na każdym poziomie etykiet hosta w górę —
// inaczej cookie przeżywa wycofanie zgody na subdomenach.
const clearGaCookies = () => {
    document.cookie
        .split(';')
        .map((entry) => entry.split('=')[0].trim())
        .filter((name) => name === '_ga' || name.startsWith('_ga_'))
        .forEach((name) => {
            const parts = window.location.hostname.split('.');
            for (let i = 0; i < parts.length - 1; i += 1) {
                document.cookie = `${name}=; Max-Age=0; path=/; domain=.${parts.slice(i).join('.')}`;
            }
            document.cookie = `${name}=; Max-Age=0; path=/`;
        });
};

export const enable = () => {
    if (!isConfigured()) return;

    enabled = true;
    window[`ga-disable-${MEASUREMENT_ID}`] = false;

    if (!injected) {
        injected = true;
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
        document.head.appendChild(script);

        // Oficjalny snippet Google zawsze robi gtag('js') jako pierwszą operację.
        // `set` musi wykonać się PRZED `config` — to udokumentowana kolejność Google.
        // Chodzi o to, żeby oczyszczone page_location/page_referrer były już w modelu
        // GA, zanim cokolwiek — sam `config`, albo enhanced measurement, które startuje
        // razem z nim — zdąży wygenerować event. Dziś ratuje nas dodatkowo
        // send_page_view: false (config nie wysyła własnego page_view), ale ta
        // kolejność ma być poprawna sama w sobie, a nie tylko dzięki temu, że coś
        // innego akurat to maskuje.
        gtag('js', new Date());
        setPageContext();
        // send_page_view: false — pageview'y wysyła usePageViews przy zmianie routa.
        // Bez tego pierwsze wejście policzyłoby się dwa razy.
        gtag('config', MEASUREMENT_ID, { send_page_view: false });
    } else {
        // Na drugiej zgodzie (gdy consent jest ponownie udzielony), wciąż
        // aktualizujemy oczyszczone page_location/page_referrer w GA
        setPageContext();
    }

    if (currentUserId) gtag('set', { user_id: currentUserId });
};

export const disable = () => {
    enabled = false;
    if (isConfigured()) window[`ga-disable-${MEASUREMENT_ID}`] = true;
    clearGaCookies();
};

// GA4 domyślnie dokleja page_location z document.location.href, razem z query stringiem.
// Reset hasła i weryfikacja e-mail noszą sekretny token właśnie w ?token=, więc surowy
// href nigdy nie może trafić do Google — nadpisujemy page_location origin+pathname
// na każdym wysyłanym evencie.
// Świadomy kompromis: obcinamy CAŁY query string, nie tylko ?token=. Kosztuje nas
// to utm_* i gclid, czyli dane, z których GA4 liczy atrybucję kampanii i ruchu
// płatnego — te parametry po prostu nigdy nie dotrą do Google. Jeśli atrybucja
// kiedyś okaże się potrzebna, poprawka to allowlista (przepuść utm_*/gclid,
// odetnij resztę), a nie rozluźnienie tego obcinania — sekrety też żyją w query
// stringu i nie ma bezpiecznego sposobu odróżnienia ich na tym poziomie.
const sanitizedLocation = () => `${window.location.origin}${window.location.pathname}`;

// document.referrer (page_referrer / `dr` na drucie) też potrafi nieść token — ta
// aplikacja ma prawdziwe linki <a>, które powodują pełne przeładowanie dokumentu
// (logo w Navigation, linki na /reset-password i /email-verification). Kliknięcie
// takiego linku z /reset-password?token=... ustawia document.referrer na URL ze
// spaloną wartością tokena na stronie docelowej.
const sanitizedReferrer = () => {
    if (!document.referrer) return '';
    try {
        const url = new URL(document.referrer);
        return `${url.origin}${url.pathname}`;
    } catch (e) {
        return '';
    }
};

// gtag('set') ustawia domyślne wartości dla WSZYSTKICH zdarzeń — także tych,
// które biblioteka generuje sama (enhanced measurement: form_start, scroll,
// click). Nasze trackEvent ich nie widzi, więc nadpisanie per-event nie
// wystarcza. Tokeny resetu hasła i weryfikacji maila siedzą w query stringu,
// który nigdy nie może trafić do Google.
export const setPageContext = () => {
    if (!enabled) return;
    gtag('set', { page_location: sanitizedLocation(), page_referrer: sanitizedReferrer() });
};

export const trackEvent = (name, params = {}) => {
    if (!enabled) return;
    gtag('event', name, {
        ...params,
        page_location: sanitizedLocation(),
        page_referrer: sanitizedReferrer(),
    });
};

// Wołane także przed udzieleniem zgody (np. przy starcie z zapisanym tokenem).
// Zapamiętujemy wartość i wysyłamy ją dopiero, gdy GA wolno działać.
export const setUserId = (userId) => {
    currentUserId = userId;
    if (!enabled) return;
    gtag('set', { user_id: userId });
};
