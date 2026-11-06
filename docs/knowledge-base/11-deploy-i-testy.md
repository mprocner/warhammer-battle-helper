# Uruchamianie, deploy i testy

## Jak to działa

**Lokalnie:** `docker-compose.yml` stawia `frontend` (3000), `backend` (8080) i `mongo`.
Panel admina działa na porcie 3001.

**Produkcja** (szczegóły w `DEPLOY.md`): VPS, `docker-compose.prod.yml` z `.env.prod`
(`REACT_APP_API_URL`, `MONGO_*`, `ALLOWED_ORIGINS`, `ADMIN_BASENAME`), przed nim nginx
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
