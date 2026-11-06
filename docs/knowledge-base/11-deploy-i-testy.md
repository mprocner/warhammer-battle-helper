# Uruchamianie, deploy i testy

## Jak to działa

**Lokalnie:** `docker-compose.yml` stawia `frontend` (3000), `backend` (8080) i `mongo`.
Panel admina działa na porcie 3001.

**Produkcja** (szczegóły w `DEPLOY.md`): VPS, `docker-compose.prod.yml` z `.env.prod`
(`REACT_APP_API_URL`, `MONGO_*`, `ALLOWED_ORIGINS`, `ADMIN_BASENAME`, `SMTP_*`,
`CONTACT_EMAIL` — skrzynka formularza kontaktowego, `TRUSTED_PROXIES` — opcjonalnie), przed nim nginx
z Certbotem (`nginx.vps.conf.example`). `scripts/autopull.sh` (usługa systemd
`autopull.service`) co 5 minut sprawdza gałąź i przy nowych commitach uruchamia
`scripts/deploy.sh`.

**Testy:**
- Frontend: `CI=true npm test -- --watchAll=false` w `warhammer-battle-helper-front/`
  (jeden plik: `--testPathPattern=<nazwa>`). Gołe `npx jest` nie działa, bo konfiguracją
  zarządza CRA. Znany fail bazowy: `App.test.js` (ESM w axios).
- Backend: `go test ./...` w `warhammer-battle-helper-backend/`. Logika jest testowana głównie
  przez czyste predykaty i serwisy z atrapami magazynów.
- Ograniczenia jsdom (PointerEvent, `isTrusted`, `getBoundingClientRect`, TipTap): sekcja
  „Testy frontendu” w `CLAUDE.md`.
- Ręczne scenariusze: `GAME_TESTING_GUIDE.md` (multiplayer przez curl), `VISUAL-CHECK.md`
  (lista do sprawdzenia okiem).

## Pułapki

- Autodeploy restartuje backend, co kończy trwające minigry (stan w pamięci) i rozłącza
  WebSockety. Klienci łączą się ponownie sami.
- Repo nie ma CI na GitHubie, więc testy trzeba uruchamiać lokalnie przed pushem.
- Pliki użytkowników leżą w wolumenach Dockera. Backup to baza **i** wolumeny.
- **Logi i retencja obiecana w polityce prywatności.** Polityka mówi, że logi z adresami IP
  żyją do 14 dni. Trzyma to tylko nginx na hoście (logrotate: `daily`, `rotate 14`, format
  `playrpg` bez query stringów w `nginx.vps.conf.example`). Logi kontenerów rotują tylko po
  rozmiarze (`x-logging` w `docker-compose.prod.yml`: 3 × 10 MB, kasowane przy `down` w
  `deploy.sh`), więc nie mogą zawierać IP — dlatego backend używa `RequestLogger` zamiast
  loggera z `gin.Default()` (bez IP i bez query stringa, w którym WebSocket niesie JWT).
  Nowy `log.Printf` z adresem IP albo e-mailem łamie politykę. Szczegóły: `DEPLOY.md`,
  „Logs and retention”.
- **Kopie zapasowe** (`deploy.sh`): 7 ostatnich archiwów bazy i 5 ostatnich kopii każdego
  wolumenu z plikami. Polityka prywatności opisuje je jako „usuwane w ramach rotacji” — zmiana
  liczby kopii to też przegląd polityki.
- **Porty kontenerów tylko na `127.0.0.1`.** Jedynym wejściem z internetu jest nginx na hoście
  (TLS, `auth_basic`, format logów). Port opublikowany jako `"8080:8080"` słucha na publicznym
  IP i omija nginx, a `ufw deny` go nie zamyka: Docker wstawia swoje reguły NAT przed regułami
  ufw. Dlatego każdy `ports:` w `docker-compose.prod.yml` ma prefiks `127.0.0.1:` (frontend
  i backend dopiero od 2026-11-06). Wyjątek to netdata z `network_mode: host`: nie ma NAT
  Dockera, więc tam działa `ufw deny 19999`. Wiązanie do loopbacka jest szczelne od Docker
  Engine 28 (wcześniej sąsiad w tej samej sieci L2 mógł dosłać pakiet na `127.0.0.1`).
