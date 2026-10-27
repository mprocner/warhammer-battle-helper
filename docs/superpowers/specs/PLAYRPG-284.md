# PLAYRPG-284 — Strona główna (landing page)

## Cel

Dziś `/` przekierowuje gościa prosto na `/login` (`App.js`, `<Navigate to="/login">`), więc nowa
osoba z linku nie dowiaduje się, czym jest aplikacja. Dodajemy statyczną stronę główną, której
zadaniem jest **pozyskanie nowych graczy i MG**: klimatyczny hero, trzy kluczowe funkcje ze
screenshotami i CTA do rejestracji. Lobby gier przenosi się pod `/games`.

## Analiza konkurencji (skrót)

| Aplikacja | Co jest na stronie głównej | Wniosek |
|---|---|---|
| Roll20 | Hero + CTA, logotypy systemów, siatka funkcji, social proof, marketplace | Dużo treści, ton SaaS |
| Foundry VTT | Ciemny fantasy artwork, „kup raz, hostuj sam”, funkcje, news | Klimat sprzedaje |
| Owlbear Rodeo | Jedno zdanie, jeden przycisk, kilka zrzutów | Prostota jako wartość |
| Alchemy RPG | Kinowy hero, sekcje immersji, free tier jako CTA | Klimat + jasne CTA |
| Demiplane / D&D Beyond | Katalog systemów i treści na pierwszym planie | Nie pasuje — systemy u nas sterowane z panelu admina |

Rozważone kierunki: A — kinowy hero + zig-zag, B — pergamin (split hero + kafle + „Jak zacząć”),
C — minimal z przełącznikiem zakładek. **Wybrany A.**

## Decyzje

| Temat | Decyzja |
|---|---|
| Adres | `/` = landing dla wszystkich (gość i zalogowany). Lobby/sesja przenosi się pod `/games`. |
| Cel strony | Konwersja gościa. Zalogowany widzi tę samą stronę, różni się tylko CTA. |
| Kierunek wizualny | A: pełnoekranowy ciemny hero na screenshocie sceny, 3 funkcje w zig-zag, końcowy pas CTA. |
| Funkcje | Scena/mapa, Kreator szablonów, Narzędzia MG. Karty gotowych systemów nie są argumentem. |
| Systemy | **Brak** jakiejkolwiek listy systemów — widoczność systemów to config w panelu admina, statyczna strona go nie dubluje. |
| Grafika | Prawdziwe screenshoty aplikacji, dostarczane przez użytkownika. Bez placeholderów na produkcji — brak plików blokuje merge. |
| Stopka | Brak. `Navigation` już ma ikony Prywatność/Licencje/Regulamin dla gościa. |
| SEO | Poza zakresem. `robots.txt` (`Disallow: /`) i `<meta name="robots" content="noindex, nofollow">` zostają bez zmian — osobny ticket. |
| Implementacja | Komponent React + BEM w `style.css` + i18n `landing.*` + ikony MUI. Nie MUI `sx`-heavy, nie statyczny HTML w `public/`. |

Poza zakresem: moduł aktualności, sekcja „Jak zacząć”, SEO/prerender, globalna stopka.

## Struktura strony

1. **Hero** (pełna szerokość, `min-height: 70vh` na desktopie, auto na mobile).
   Tło warstwowe: `linear-gradient(180deg, rgba(30,22,14,.55), rgba(30,22,14,.9))`,
   `var(--landing-hero-image)` `center / cover` (zmienna ustawiana inline w JSX na `url(/img/landing/hero.webp)` — CRA 5 rozwiązuje `url('/…')` w `style.css` jako moduł i build pada), kolor bazowy `#3a2f1f` — gdy obraz się nie
   wczyta, zostaje ciemne tło i tekst dalej jest czytelny. Treść wyśrodkowana:
   - H1 (Cinzel): „Twoja kampania. Twój stół. W przeglądarce.”
   - Podtytuł (Crimson Text, `#e8d5b7`): „Mapy z mgłą wojny, własne karty postaci i wszystko,
     czego MG potrzebuje przy sesji online.”
   - CTA główne (`LandingCta`, tło `#8b2f2f`).
   - CTA drugie (obrys `#c9975b`): „Zobacz funkcje”, przewija do sekcji funkcji
     (ref + `scrollIntoView({ behavior: 'smooth' })`).
2. **Funkcje** (tło `linear-gradient(135deg, #f4e8d8, #e8dcc4)`). Trzy wiersze
   tekst + obraz, co drugi odwrócony:
   - `scene` — „Scena, która żyje”: mgła wojny odkrywana pędzlem, rysowanie, tokeny z HP i
     stanami; wszyscy widzą zmiany na żywo. Ikona `Map`.
   - `creator` — „Zbuduj własny system”: kreator kart z polami, formułami i sekcjami; gracz
     widzi dokładnie to, co zaprojektujesz. Ikona `DashboardCustomize`.
   - `gmTools` — „MG ma wszystko pod ręką”: handouty, muzyka, pliki, ukryte rzuty, chat z
     komendami kości. Ikona `AutoStories`.
3. **Pas CTA** (tło `#7a5c42`, tekst `#f4e8d8`): „Gotowy na pierwszą sesję?” + `LandingCta`.

Teksty powyżej to wersja startowa — w kodzie wyłącznie jako klucze i18n.

## Komponenty

### `components/landing/LandingPage.jsx`

`({ user })`. Bez stanu, bez fetchy. Funkcje opisane stałą:

```js
const FEATURES = [
    { key: 'scene', Icon: MapIcon, image: '/img/landing/scene.webp' },
    { key: 'creator', Icon: DashboardCustomizeIcon, image: '/img/landing/creator.webp' },
    { key: 'gmTools', Icon: AutoStoriesIcon, image: '/img/landing/gm-tools.webp' },
];
```

Jeden `FEATURES.map((feature, index) => …)`; nieparzyste indeksy dostają modifier
`landing__feature--reversed`. Obraz: `<img loading="lazy" alt={t(\`landing.features.${key}.imageAlt\`)}>`
w ramce z `aspect-ratio: 16 / 10`, żeby layout nie skakał przy ładowaniu.

### `components/landing/LandingCta.jsx`

`({ user })`. Jedyne miejsce z logiką gość/zalogowany:
- `user == null` → link do `/register`, tekst `landing.cta.register` („Załóż darmowe konto”).
- `user` ustawiony → link do `/games`, tekst `landing.cta.games` („Przejdź do gier”).

Renderuje `react-router-dom` `<Link>` z klasą `landing__cta`. Używany w hero i w pasie CTA.

### Style — blok `.landing` w `style.css`

Elementy: `__hero`, `__hero-content`, `__hero-title`, `__hero-subtitle`, `__hero-actions`,
`__cta`, `__cta-secondary`, `__features`, `__feature`, `__feature-text`, `__feature-title`,
`__feature-body`, `__feature-media`, `__feature-image`, `__cta-band`, `__cta-band-title`.
Modifier `__feature--reversed` (zamienia kolejność kolumn) deklarowany **po** regułach bazowych
`__feature` — modifier zadeklarowany przed bazą jest martwy.

Breakpoint `max-width: 768px`: `__feature` (także `--reversed`) przechodzi w jedną kolumnę, obraz
nad tekstem; `__hero-actions` zawija przyciski pod siebie.

Fonty Cinzel i Crimson Text są już ładowane w `public/index.html`.

## Routing — `App.js` i `Navigation.jsx`

- `/` → `<LandingPage user={user} />`, bez `ProtectedRoute`.
- `/games` → dotychczasowa gałąź `currentGameId ? <GameSession …/> : <GameLobby …/>` owinięta w
  `<ProtectedRoute user={user}>`. Zewnętrzny ternary `user ? … : <Navigate to="/login">` znika —
  `ProtectedRoute` robi już to samo.
- `/login` i `/register` dla zalogowanego: `<Navigate to="/games" replace />` (było `/`).
- `Navigation.jsx` logo: `href={user ? '/games' : '/'}` — nadal `<a href>` (pełny reload), bez
  zmiany zachowania.

Maile z backendu (`internal/email/email.go`) linkują do `/verify-email` i `/reset-password` —
zmiana ich nie dotyczy.

Przepływy:
- Gość na `/` → landing → „Załóż darmowe konto” → `/register` → login → `/games`.
- Zalogowany na `/` → landing → „Przejdź do gier” → `/games`.
- Gość na `/games` → `ProtectedRoute` → `/login`.

## i18n

Klucze w `src/locales/en/translation.json` i `src/locales/pl/translation.json`:

```
landing.hero.title
landing.hero.subtitle
landing.cta.register
landing.cta.games
landing.cta.features
landing.features.scene.title | .body | .imageAlt
landing.features.creator.title | .body | .imageAlt
landing.features.gmTools.title | .body | .imageAlt
landing.ctaBand.title
```

## Screenshoty (dostarcza użytkownik)

Katalog `warhammer-battle-helper-front/public/img/landing/`:

| Plik | Wymiar | Limit | Treść |
|---|---|---|---|
| `hero.webp` | 1920×1080 | ~300 KB | Scena z mgłą i tokenami; spokojna kompozycja — leży pod tekstem |
| `scene.webp` | 1600×1000 | ~150 KB | Scena: mgła, rysunek, tokeny z pierścieniem HP |
| `creator.webp` | 1600×1000 | ~150 KB | Kreator szablonu z widocznym polem wyliczanym |
| `gm-tools.webp` | 1600×1000 | ~150 KB | Panel MG: handouty/muzyka/chat z rzutem |

Bez danych osobowych na zrzutach (maile, nazwy kont, treści czatu prawdziwych graczy).

## Testy

`components/landing/LandingPage.test.jsx` (`import '../../i18n';`, render w `MemoryRouter`):
- `user = null` → oba CTA (hero + pas) mają `href="/register"`.
- `user = { email, token }` → oba CTA mają `href="/games"`.
- Renderują się 3 sekcje funkcji, każda z `<img>` o niepustym `alt`.
- Każdy klucz pod `landing` istnieje w en i w pl (porównanie zbioru ścieżek kluczy obu drzew).

Routingu w `App.js` nie da się pokryć — `App.test.js` to znany baseline fail (axios ESM).
Weryfikacja ręczna w przeglądarce:
- `/` jako gość i jako zalogowany (CTA), „Zobacz funkcje” przewija.
- `/games` jako gość → `/login`; login → `/games`.
- Logo: gość → `/`, zalogowany → `/games`.
- Mobile (< 768px): jedna kolumna, CTA zawinięte.
