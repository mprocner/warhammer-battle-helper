# PLAYRPG-284 Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the guest redirect on `/` with a static landing page (dark cinematic hero, three zig-zag feature rows, CTA band) and move the game lobby to `/games`.

**Architecture:** Two stateless React components in `src/components/landing/` — `LandingCta` (the only place with guest/logged-in logic) and `LandingPage` (layout driven by a `FEATURES` constant). BEM block `.landing` in `style.css`, all copy under i18n `landing.*`. Routing change in `App.js`, logo target in `Navigation.jsx`.

**Tech Stack:** React 18, react-router-dom 6, react-i18next, `@mui/icons-material`, CRA 5 (react-scripts 5.0.1), Jest + Testing Library.

Spec: `docs/superpowers/specs/PLAYRPG-284.md`

## Global Constraints

- Every user-visible string goes through `t('landing.…')`; English in `src/locales/en/translation.json`, Polish in `src/locales/pl/translation.json`. No literal strings in JSX.
- Icons only from `@mui/icons-material`.
- Code comments in English.
- No list of game systems anywhere on the page.
- No footer; no changes to `public/robots.txt` or the `noindex` meta in `public/index.html`.
- BEM modifiers (`landing__feature--reversed`) are declared **after** their base rule in `style.css` — a modifier declared before its base is silently dead.
- **Do not reference images with `url('/img/…')` inside `style.css`.** CRA 5's css-loader has no URL filter, so it tries to resolve root-relative paths as modules and the build fails. Pass the hero image through an inline CSS custom property instead (Task 2).
- Palette: hero overlay `rgba(30,22,14,.55)` → `rgba(30,22,14,.9)`, base `#3a2f1f`; subtitle `#e8d5b7`; primary CTA `#8b2f2f`; secondary CTA outline `#c9975b`; features background `linear-gradient(135deg, #f4e8d8 0%, #e8dcc4 100%)`; text `#3a2f1f`; CTA band `#7a5c42` with text `#f4e8d8`. Fonts: Cinzel for headings, Crimson Text for body (already loaded in `public/index.html`).
- Mobile breakpoint: `max-width: 768px`.
- Run frontend tests from `warhammer-battle-helper-front/`: `CI=true npm test -- --watchAll=false --testPathPattern=<name>`. Bare `npx jest` does not work. `App.test.js` failing on axios ESM is the known baseline, not a regression.
- Parallel sessions share this checkout: verify the branch in the same command as every commit (`git branch --show-current && git commit …`). Work on `main`.

## File Structure

| File | Responsibility |
|---|---|
| Create `warhammer-battle-helper-front/src/components/landing/LandingCta.jsx` | Primary CTA link: guest → `/register`, logged in → `/games` |
| Create `warhammer-battle-helper-front/src/components/landing/LandingCta.test.jsx` | CTA target + label per user state |
| Create `warhammer-battle-helper-front/src/components/landing/LandingPage.jsx` | Page layout: hero, features, CTA band |
| Create `warhammer-battle-helper-front/src/components/landing/LandingPage.test.jsx` | Both CTAs, 3 features with alt text, scroll button, en/pl key parity |
| Modify `warhammer-battle-helper-front/src/locales/en/translation.json` | Add `landing` subtree |
| Modify `warhammer-battle-helper-front/src/locales/pl/translation.json` | Add `landing` subtree |
| Modify `warhammer-battle-helper-front/src/style.css` | Append `.landing` block |
| Modify `warhammer-battle-helper-front/src/App.js` | `/` → landing, lobby/session → `/games` |
| Modify `warhammer-battle-helper-front/src/components/Navigation.jsx:49` | Logo target depends on `user` |
| Add (user) `warhammer-battle-helper-front/public/img/landing/{hero,scene,creator,gm-tools}.webp` | Screenshots |

---

### Task 1: Translations + `LandingCta`

**Files:**
- Modify: `warhammer-battle-helper-front/src/locales/en/translation.json`
- Modify: `warhammer-battle-helper-front/src/locales/pl/translation.json`
- Create: `warhammer-battle-helper-front/src/components/landing/LandingCta.jsx`
- Test: `warhammer-battle-helper-front/src/components/landing/LandingCta.test.jsx`

**Interfaces:**
- Produces: `export default LandingCta` — props `{ user }` (`null` or `{ email, token }`); renders a single react-router `<Link className="landing__cta">`. Translation subtree `landing` with the exact keys listed in Step 1.

- [ ] **Step 1: Add the `landing` subtree to both translation files**

Both files round-trip losslessly through `json.dumps(indent=2, ensure_ascii=False)` (verified), so append the subtree with a script instead of hand-editing a 2000-line file. Run from `warhammer-battle-helper-front/`:

```bash
python3 - <<'EOF'
import json

LANDING = {
    "en": {
        "hero": {
            "title": "Your campaign. Your table. In the browser.",
            "subtitle": "Maps with fog of war, custom character sheets and everything a GM needs to run a session online."
        },
        "cta": {
            "register": "Create a free account",
            "games": "Go to your games",
            "features": "See features"
        },
        "features": {
            "scene": {
                "title": "A scene that comes alive",
                "body": "Reveal the fog of war with a brush, draw on the map, track tokens with HP and conditions — everyone sees every change live.",
                "imageAlt": "Game scene with fog of war and tokens"
            },
            "creator": {
                "title": "Build your own system",
                "body": "The sheet creator gives you fields, formulas and sections. Players see exactly what you design.",
                "imageAlt": "Character sheet template creator"
            },
            "gmTools": {
                "title": "Everything a GM needs at hand",
                "body": "Handouts, music, files, hidden rolls and a chat with dice commands.",
                "imageAlt": "GM tools: handouts, music and chat"
            }
        },
        "ctaBand": {
            "title": "Ready for your first session?"
        }
    },
    "pl": {
        "hero": {
            "title": "Twoja kampania. Twój stół. W przeglądarce.",
            "subtitle": "Mapy z mgłą wojny, własne karty postaci i wszystko, czego MG potrzebuje przy sesji online."
        },
        "cta": {
            "register": "Załóż darmowe konto",
            "games": "Przejdź do gier",
            "features": "Zobacz funkcje"
        },
        "features": {
            "scene": {
                "title": "Scena, która żyje",
                "body": "Mgła wojny odkrywana pędzlem, rysowanie po mapie, tokeny z HP i stanami — wszyscy widzą każdą zmianę na żywo.",
                "imageAlt": "Scena gry z mgłą wojny i tokenami"
            },
            "creator": {
                "title": "Zbuduj własny system",
                "body": "Kreator kart daje Ci pola, formuły i sekcje. Gracz widzi dokładnie to, co zaprojektujesz.",
                "imageAlt": "Kreator szablonu karty postaci"
            },
            "gmTools": {
                "title": "MG ma wszystko pod ręką",
                "body": "Handouty, muzyka, pliki, ukryte rzuty i chat z komendami kości.",
                "imageAlt": "Narzędzia MG: handouty, muzyka i chat"
            }
        },
        "ctaBand": {
            "title": "Gotowy na pierwszą sesję?"
        }
    }
}

for lang, subtree in LANDING.items():
    path = f"src/locales/{lang}/translation.json"
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    assert "landing" not in data, f"{path} already has a landing key"
    data["landing"] = subtree
    with open(path, "w", encoding="utf-8") as f:
        f.write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
EOF
git diff --stat src/locales
```

Expected: each translation file shows only added lines (about 35 `+`, 1 `-` for the comma on the previous last key).

- [ ] **Step 2: Write the failing test**

`warhammer-battle-helper-front/src/components/landing/LandingCta.test.jsx`:

```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import LandingCta from './LandingCta';

const renderCta = (user) => render(
  <MemoryRouter>
    <LandingCta user={user} />
  </MemoryRouter>
);

describe('LandingCta', () => {
  it('sends a guest to registration', () => {
    renderCta(null);
    expect(screen.getByRole('link', { name: i18n.t('landing.cta.register') }))
      .toHaveAttribute('href', '/register');
  });

  it('sends a logged-in user to the game list', () => {
    renderCta({ email: 'gm@example.com', token: 't' });
    expect(screen.getByRole('link', { name: i18n.t('landing.cta.games') }))
      .toHaveAttribute('href', '/games');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=LandingCta`
Expected: FAIL — `Cannot find module './LandingCta'`.

- [ ] **Step 4: Write the implementation**

`warhammer-battle-helper-front/src/components/landing/LandingCta.jsx`:

```jsx
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=LandingCta`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add src/locales/en/translation.json src/locales/pl/translation.json src/components/landing/LandingCta.jsx src/components/landing/LandingCta.test.jsx
git branch --show-current && git commit -m "feat: PLAYRPG-284 landing translations and CTA

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Expected: first line of output is `main`.

---

### Task 2: `LandingPage` + styles

**Files:**
- Create: `warhammer-battle-helper-front/src/components/landing/LandingPage.jsx`
- Modify: `warhammer-battle-helper-front/src/style.css` (append at end of file)
- Test: `warhammer-battle-helper-front/src/components/landing/LandingPage.test.jsx`

**Interfaces:**
- Consumes: `LandingCta` (`{ user }`) from Task 1; `landing.*` keys from Task 1.
- Produces: `export default LandingPage` — props `{ user }`. Task 3 renders `<LandingPage user={user} />`.

- [ ] **Step 1: Write the failing test**

`warhammer-battle-helper-front/src/components/landing/LandingPage.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import en from '../../locales/en/translation.json';
import pl from '../../locales/pl/translation.json';
import LandingPage from './LandingPage';

const renderPage = (user) => render(
  <MemoryRouter>
    <LandingPage user={user} />
  </MemoryRouter>
);

// Flattens a translation subtree into dotted key paths, e.g. "features.scene.title".
const keyPaths = (node, prefix = '') => Object.entries(node).flatMap(([key, value]) => (
  typeof value === 'object' ? keyPaths(value, `${prefix}${key}.`) : [`${prefix}${key}`]
));

describe('LandingPage', () => {
  it('points both calls to action at registration for a guest', () => {
    renderPage(null);
    const links = screen.getAllByRole('link', { name: i18n.t('landing.cta.register') });
    expect(links).toHaveLength(2);
    links.forEach(link => expect(link).toHaveAttribute('href', '/register'));
  });

  it('points both calls to action at the game list for a logged-in user', () => {
    renderPage({ email: 'gm@example.com', token: 't' });
    const links = screen.getAllByRole('link', { name: i18n.t('landing.cta.games') });
    expect(links).toHaveLength(2);
    links.forEach(link => expect(link).toHaveAttribute('href', '/games'));
  });

  it('renders the three features, each with a described screenshot', () => {
    renderPage(null);
    ['scene', 'creator', 'gmTools'].forEach(key => {
      expect(screen.getByRole('heading', { name: i18n.t(`landing.features.${key}.title`) }))
        .toBeInTheDocument();
      expect(screen.getByAltText(i18n.t(`landing.features.${key}.imageAlt`))).toBeInTheDocument();
    });
    expect(screen.getAllByRole('img')).toHaveLength(3);
  });

  it('scrolls to the features when "see features" is clicked', () => {
    const scrollIntoView = jest.fn();
    // jsdom has no layout, so scrollIntoView does not exist on elements.
    Element.prototype.scrollIntoView = scrollIntoView;
    renderPage(null);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('landing.cta.features') }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
    delete Element.prototype.scrollIntoView;
  });

  it('has the same landing keys in English and Polish', () => {
    expect(keyPaths(pl.landing).sort()).toEqual(keyPaths(en.landing).sort());
  });
});
```

Note: `getAllByRole('img')` counts only `<img>` elements — MUI icons render `<svg aria-hidden="true">`, which are excluded from the accessibility tree.

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=LandingPage`
Expected: FAIL — `Cannot find module './LandingPage'`.

- [ ] **Step 3: Write the component**

`warhammer-battle-helper-front/src/components/landing/LandingPage.jsx`:

```jsx
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
```

Deviation from spec: the features section is reached through a ref, not `id="features"` — nothing links to the anchor from outside, so the id would be unused.

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=Landing`
Expected: PASS, 7 tests (2 `LandingCta` + 5 `LandingPage`).

- [ ] **Step 5: Append the styles**

Append to the end of `warhammer-battle-helper-front/src/style.css` (file currently ends with the `.mcb__limit input:focus` rule):

```css

/* ===== Landing page (PLAYRPG-284) ===== */
.landing {
    color: #3a2f1f;
    font-family: 'Crimson Text', Georgia, serif;
}

.landing__hero {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 70vh;
    padding: 64px 16px;
    text-align: center;
    color: #f4e8d8;
    /* Base colour stays when the screenshot is missing, so the text remains readable. */
    background:
        linear-gradient(180deg, rgba(30, 22, 14, 0.55) 0%, rgba(30, 22, 14, 0.9) 100%),
        var(--landing-hero-image, none) center / cover no-repeat,
        #3a2f1f;
}

.landing__hero-content {
    max-width: 760px;
}

.landing__hero-title {
    margin: 0 0 16px;
    font-family: 'Cinzel', serif;
    font-size: 3rem;
    font-weight: 700;
    line-height: 1.15;
}

.landing__hero-subtitle {
    margin: 0 0 32px;
    font-size: 1.35rem;
    line-height: 1.45;
    color: #e8d5b7;
}

.landing__hero-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 16px;
}

.landing__cta {
    display: inline-block;
    padding: 12px 28px;
    border-radius: 4px;
    background: #8b2f2f;
    color: #ffffff;
    font-family: 'Roboto', sans-serif;
    font-size: 1rem;
    font-weight: 500;
    text-decoration: none;
    transition: background-color 0.2s;
}

.landing__cta:hover {
    background: #a93434;
}

.landing__cta-secondary {
    padding: 11px 27px;
    border: 1px solid #c9975b;
    border-radius: 4px;
    background: transparent;
    color: #c9975b;
    font-family: 'Roboto', sans-serif;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
}

.landing__cta-secondary:hover {
    background: rgba(201, 151, 91, 0.12);
}

.landing__features {
    display: flex;
    flex-direction: column;
    gap: 64px;
    padding: 72px 16px;
    background: linear-gradient(135deg, #f4e8d8 0%, #e8dcc4 100%);
}

.landing__feature {
    display: flex;
    align-items: center;
    gap: 48px;
    width: 100%;
    max-width: 1100px;
    margin: 0 auto;
}

.landing__feature-text {
    flex: 1 1 0;
}

.landing__feature-title {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 0 12px;
    font-family: 'Cinzel', serif;
    font-size: 1.75rem;
    color: #3a2f1f;
}

.landing__feature-icon {
    color: #c9975b;
}

.landing__feature-body {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.5;
    color: #5a4a3a;
}

.landing__feature-media {
    flex: 1.2 1 0;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    border: 1px solid #7a5c42;
    border-radius: 6px;
    background: #e8dcc4;
    box-shadow: 0 8px 24px rgba(58, 47, 31, 0.25);
}

.landing__feature-image {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}

/* Declared after the base .landing__feature rule, otherwise it loses the cascade. */
.landing__feature--reversed {
    flex-direction: row-reverse;
}

.landing__cta-band {
    padding: 56px 16px;
    text-align: center;
    background: #7a5c42;
    color: #f4e8d8;
}

.landing__cta-band-title {
    margin: 0 0 24px;
    font-family: 'Cinzel', serif;
    font-size: 2rem;
}

@media (max-width: 768px) {
    .landing__hero {
        min-height: auto;
        padding: 48px 16px;
    }

    .landing__hero-title {
        font-size: 2rem;
    }

    .landing__hero-subtitle {
        font-size: 1.1rem;
    }

    /* Doubled selector beats .landing__feature--reversed regardless of order. */
    .landing__feature,
    .landing__feature.landing__feature--reversed {
        flex-direction: column;
        gap: 20px;
    }

    .landing__feature-text,
    .landing__feature-media {
        flex: none;
        width: 100%;
    }

    /* Image above text on mobile. */
    .landing__feature-media {
        order: -1;
    }
}
```

- [ ] **Step 6: Verify the CSS compiles in a production build**

Run: `npm run build 2>&1 | tail -5`
Expected: `The build folder is ready to be deployed.` (no `Module not found`). `build/` is gitignored — nothing to clean up.

- [ ] **Step 7: Commit**

```bash
git add src/components/landing/LandingPage.jsx src/components/landing/LandingPage.test.jsx src/style.css
git branch --show-current && git commit -m "feat: PLAYRPG-284 landing page layout and styles

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Routing — landing on `/`, lobby on `/games`

**Files:**
- Modify: `warhammer-battle-helper-front/src/App.js` (imports; routes at lines ~154-221)
- Modify: `warhammer-battle-helper-front/src/components/Navigation.jsx:49`

**Interfaces:**
- Consumes: `LandingPage` (`{ user }`) from Task 2.

No automated test: `App.test.js` is the known axios ESM baseline failure, so `App` cannot be rendered in Jest. Verified manually in Task 4.

- [ ] **Step 1: Import `LandingPage` in `App.js`**

After the line `import CharacterSheetPage from './components/CharacterSheetPage';` add:

```js
import LandingPage from './components/landing/LandingPage';
```

- [ ] **Step 2: Redirect logged-in users from `/login` and `/register` to `/games`**

In both the `/login` and `/register` routes replace:

```jsx
                                <Navigate to="/" replace /> :
```

with:

```jsx
                                <Navigate to="/games" replace /> :
```

(The string occurs exactly twice; use replace-all.)

- [ ] **Step 3: Split the root route**

Replace the whole block starting at `{/* Game Lobby - Main multiplayer hub */}` up to and including its closing `/>` (just before `</Routes>`):

```jsx
                        {/* Game Lobby - Main multiplayer hub */}
                        <Route
                            path="/"
                            element={
                                user ? (
                                    <ProtectedRoute user={user}>
                                        {currentGameId ? (
                                            <GameSession
                                                gameId={currentGameId}
                                                token={user.token}
                                                onGoToGameList={handleGoToGameList}
                                                onSessionEnded={handleSessionEnded}
                                                onLogout={handleLogout}
                                            />
                                        ) : (
                                            <GameLobby
                                                onJoinGame={handleJoinGame}
                                                token={user.token}
                                                userEmail={user.email}
                                                notice={lobbyNotice}
                                                onDismissNotice={() => setLobbyNotice(null)}
                                            />
                                        )}
                                    </ProtectedRoute>
                                ) : (
                                    <Navigate to="/login" replace />
                                )
                            }
                        />
```

with:

```jsx
                        <Route path="/" element={<LandingPage user={user} />} />

                        {/* Game Lobby - Main multiplayer hub. ProtectedRoute sends guests to /login. */}
                        <Route
                            path="/games"
                            element={
                                <ProtectedRoute user={user}>
                                    {currentGameId ? (
                                        <GameSession
                                            gameId={currentGameId}
                                            token={user?.token}
                                            onGoToGameList={handleGoToGameList}
                                            onSessionEnded={handleSessionEnded}
                                            onLogout={handleLogout}
                                        />
                                    ) : (
                                        <GameLobby
                                            onJoinGame={handleJoinGame}
                                            token={user?.token}
                                            userEmail={user?.email}
                                            notice={lobbyNotice}
                                            onDismissNotice={() => setLobbyNotice(null)}
                                        />
                                    )}
                                </ProtectedRoute>
                            }
                        />
```

Why `user?.`: the children JSX is evaluated before `ProtectedRoute` decides to redirect, so with `user === null` a plain `user.token` would throw. The old outer ternary guarded that; optional chaining replaces it. The values are never rendered for a guest.

`Navigate` is still used by `/login` and `/register` — keep the import.

- [ ] **Step 4: Point the logo at the right home**

In `warhammer-battle-helper-front/src/components/Navigation.jsx` replace:

```jsx
                    <Box component="a" href="/" sx={{ display: 'flex', alignItems: 'center', flexGrow: 1, mr: 2 }}>
```

with:

```jsx
                    <Box component="a" href={user ? '/games' : '/'} sx={{ display: 'flex', alignItems: 'center', flexGrow: 1, mr: 2 }}>
```

- [ ] **Step 5: Check nothing else targets `/` as the lobby**

Run from `warhammer-battle-helper-front/`:

```bash
grep -rnE "navigate\('/'|to=\"/\"|href=\"/\"|Navigate to=\"/\"|href = '/'|assign\('/'\)" src | grep -v "\.test\."
```

Expected: no output (all three former hits — two `Navigate` in `App.js`, the logo — are changed).

- [ ] **Step 6: Run the frontend suite**

Run: `CI=true npm test -- --watchAll=false 2>&1 | tail -8`
Expected: only `App.test.js` fails (axios ESM baseline); everything else passes, including the 7 landing tests.

- [ ] **Step 7: Commit**

```bash
git add src/App.js src/components/Navigation.jsx
git branch --show-current && git commit -m "feat: PLAYRPG-284 landing on /, game lobby on /games

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Screenshots + browser check (user)

**Files:**
- Add: `warhammer-battle-helper-front/public/img/landing/hero.webp` (1920×1080, ~300 KB, calm scene with fog and tokens — text sits on it)
- Add: `warhammer-battle-helper-front/public/img/landing/scene.webp` (1600×1000, ~150 KB, fog + drawing + tokens with HP ring)
- Add: `warhammer-battle-helper-front/public/img/landing/creator.webp` (1600×1000, ~150 KB, template creator with a computed field visible)
- Add: `warhammer-battle-helper-front/public/img/landing/gm-tools.webp` (1600×1000, ~150 KB, handouts/music/chat with a roll)

No personal data on screenshots (emails, account names, real players' chat).

- [ ] **Step 1: User supplies the four files.** Verify:

```bash
ls -la public/img/landing/ && file public/img/landing/*.webp
```

Expected: four files, each reported as `RIFF (little-endian) data, Web/P image`.

- [ ] **Step 2: Browser check on the local stack (http://localhost:3000)**

- Guest on `/`: hero with screenshot behind text, CTA "Create a free account" → `/register`; "See features" scrolls smoothly; 3 rows alternate text/image; CTA band at the bottom.
- Logged in on `/`: both CTAs read "Go to your games" → `/games`.
- Guest on `/games` → `/login`; log in → lands on `/games`.
- Logo: guest → `/`, logged in → `/games`.
- Window < 768px: single column, image above text, hero buttons wrap.
- Switch language PL/EN in the nav: all landing copy changes.

- [ ] **Step 3: Commit the screenshots**

```bash
git add public/img/landing
git branch --show-current && git commit -m "feat: PLAYRPG-284 landing screenshots

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Merge gate: no push without these four files — placeholders do not ship.
