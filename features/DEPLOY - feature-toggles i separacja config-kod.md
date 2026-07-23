# DEPLOY: feature-toggles nie działa na VPS + separacja config/kod

Status: **do zrobienia** — notatka z sesji debugowania. Wracamy do tego.

---

## 1. Objaw (co się stało)

Na VPS zalogowany jako `mp@test.com` **widzę i mogę utworzyć grę DnD**, mimo że
`feature-toggles.json` ogranicza `dnd5e` tylko do:

```json
{
  "systems": {
    "dnd5e": {
      "allowedEmails": ["mateusz.procner@gmail.com", "bez@games4geeks.com"]
    }
  }
}
```

`GET /features` na VPS zwraca **wszystkie** systemy:
```json
{"allowedSystems":["warhammer4e","coc7e","coc7e_dark_ages","dnd5e","custom"]}
```

Lokalnie działa (bo mój lokalny mail jest na liście) — więc problem widać tylko na prodzie.

---

## 2. Diagnoza (dlaczego)

Łańcuch bramkowania systemu:

- Front: `GameLobby.jsx:468` filtruje dropdown przez `allowedSystems`
  (`.filter(sys => !allowedSystems || allowedSystems.includes(sys.value))`).
- `allowedSystems` przychodzi z `GET /features` (`App.js:57`).
- Backend `GetFeatures` (`GameHandler.go:625`) bierze email z JWT i pyta
  `FeatureToggles.AllowedSystemsFor`.
- `IsSystemAllowed` (`toggle.go:38`): jeśli klucza systemu **nie ma** w mapie toggli
  → `return true` (wszystko dozwolone).
- Tworzenie gry też sprawdza serwerowo: `GameHandler.go:53` → 403.

Skoro `dnd5e` przeszło dla niedozwolonego maila, to **mapa toggli jest pusta** →
plik `feature-toggles.json` **nie został wczytany**.

### Przyczyna źródłowa: plik nie trafia do kontenera

- `main.go:162` ładuje `features.Load("./feature-toggles.json")` — ścieżka **relatywna
  do CWD procesu**, czyli `/app` **wewnątrz kontenera**.
- `Dockerfile.prod` (multi-stage):
  - Etap 1 `builder` (`golang:1.24-alpine`): `COPY . .` wciąga cały kod **w tym
    feature-toggles.json** — ale to etap wyrzucany.
  - Etap 2 `runtime` (`alpine:3.20`): `COPY --from=builder /battle-helper .` —
    kopiuje **tylko binarkę**. JSON nigdy nie trafia do finalnego obrazu.
- `Load` przy braku pliku **po cichu** zwraca puste toggle (`toggle.go:22`,
  `os.IsNotExist` → bez panica) → fail-open → wszystko dozwolone.
- `cat feature-toggles.json` na hoście pokazuje plik, ale to **inny system plików**
  niż wnętrze kontenera. Host ≠ kontener.

---

## 3. Szybki fix (bind-mount)

W `docker-compose.prod.yml`, serwis `backend`, dodać do `volumes` (tak jak `keys`):

```yaml
    volumes:
      - ./warhammer-battle-helper-backend/keys:/app/keys:ro
      - ./warhammer-battle-helper-backend/feature-toggles.json:/app/feature-toggles.json:ro
      - backend-avatars:/app/avatars
      - backend-user-files:/app/user-files
      - backend-music-files:/app/music-files
```

Na VPS:
```bash
docker compose -f docker-compose.prod.yml up -d backend   # recreate, nie sam restart
```

Dlaczego bind-mount, a nie `COPY` w Dockerfile:
- Plik z hosta = plik kontenera 1:1. Zmiana allowlisty = edycja + `restart backend`,
  **bez rebuildu obrazu**. (Wariant `COPY` wymaga pełnego `docker compose build`,
  a `deploy.sh` używa `build --no-cache`.)
- Dodanie **nowego** wolumenu wymaga `up -d` (recreate). Późniejsze zmiany treści
  → tylko `restart` (bo `Load` czyta plik raz, przy starcie).

---

## 4. Jak wygląda build na prodzie (kontekst)

```
systemd (autopull.service)
  └─ autopull.sh    ── co 5 min: git fetch, porównuje LOCAL vs origin/main
       └─ (nowy commit) → deploy.sh:
            1. backup Mongo + woluminów
            2. git pull                                    ← CAŁE repo ląduje na VPS
            3. docker compose -f docker-compose.prod.yml build --no-cache
            4. docker compose ... down
            5. docker compose ... up -d
            6. docker image prune
```

- Build dzieje się **wewnątrz Dockera** (kontener `builder`). Host nie ma Go.
- Model: **"build on the host"** — VPS pobiera źródła i sam kompiluje.

---

## 5. Usprawnienie do rozważenia: separacja config / kod (WRACAMY DO TEGO)

Pytanie z sesji: *"mam zpullowane wszystkie pliki na VPS — da się zrobić, żeby ich
tam w ogóle nie było?"*

### Zasada
**Kod płynie jako niezmienny obraz; konfiguracja i sekrety żyją na hoście i są
montowane.** Bug z feature-toggles to objaw zatarcia tej granicy (config upieczony
jak kod).

### Docelowy model: "immutable artifact" (rejestr obrazów)

```
git push → CI (GitHub Actions):
             docker build → docker push do rejestru (GHCR)
                                    │
VPS: docker compose pull ←──────────┘   (gotowe obrazy, ZERO źródeł, ZERO builda)
     docker compose up -d
```

W compose zamiana `build:` → `image: ghcr.io/mprocner/wbh-backend:vX.Y.Z`.

Zyski:
- Brak źródeł/toolchainu na prodzie (bezpieczeństwo, mniejsza powierzchnia ataku).
- VPS nie buduje (brak OOM przy `--no-cache` na małym VPS-ie), deploy w sekundy.
- Powtarzalność + rollback (wskazujesz starszy tag, bez rebuildu).

Koszty: rejestr + pipeline CI, wersjonowanie tagów, auth do rejestru na VPS.

### Co i tak ZOSTAJE na VPS (nie należy do obrazu)
| Plik | Dlaczego |
|---|---|
| `.env.prod` | sekrety |
| `keys/*.pem` | klucze JWT (montowane) |
| `feature-toggles.json` | config runtime, edytowalny bez rebuildu |
| `docker-compose.prod.yml` | opis co uruchomić |
| `nginx.conf` | proxy hosta |

### Rekomendacja dla obecnej skali
Dla jednoosobowego projektu "build on host" jest OK. Dwa tanie usprawnienia teraz:
1. **`.dockerignore`** — żeby `COPY . .` nie wciągał `.env.prod`, `keys/`, `.git`
   nawet do wyrzucanego buildera.
2. **Bind-mounty dla configu/sekretów** (`feature-toggles.json` + `keys` już są).

Migracja do rejestru — gdy zaboli (wolny build / OOM / potrzeba rollbacków).

---

## 6. Otwarte pytania / do przemyślenia

- **Bezpieczeństwo warstw Dockera przy publicznym rejestrze:** czy przy braku
  porządnego `.dockerignore` publiczny obraz może wyciekać źródła/sekrety z warstw
  **pośredniego etapu builder**? (Sprawdzić co `docker push` faktycznie publikuje.)
- **Fail-open vs fail-closed:** `Load` przy braku pliku zwraca puste toggle
  (wszystko dozwolone). Dla feature-flagi OK, ale dla bramki chroniącej coś
  wrażliwego (panel admina) rozważyć fail-closed / panic gdy pliku brak.

---

## TODO

- [ ] Dodać bind-mount `feature-toggles.json` w `docker-compose.prod.yml`
- [ ] Zweryfikować `.dockerignore` w backendzie (`.env*`, `keys/`, `.git`)
- [ ] Zdecydować: zostajemy przy "build on host" czy migracja do rejestru (GHCR + CI)
- [ ] Rozważyć fail-closed w `features.Load` dla bramek wrażliwych
