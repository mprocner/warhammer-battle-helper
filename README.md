# Warhammer Battle Helper

Virtual tabletop companion for pen-and-paper RPG sessions. Supports real-time multiplayer, battle grid with fog of war, character management, handouts, music playback and more.

**Supported game systems:** Warhammer Fantasy Roleplay 4e, Call of Cthulhu 7e

---

## Stack

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Backend   | Go, Gin, MongoDB, gorilla/websocket     |
| Frontend  | React, DnD Kit, i18next, MUI Icons      |
| Admin     | React Admin (separate app)              |
| Infra     | Docker, nginx, Certbot                  |

---

## Project structure

```
warhammer-battle-helper/
├── warhammer-battle-helper-backend/   — Go API
├── warhammer-battle-helper-front/     — React frontend (port 3000)
├── warhammer-battle-helper-admin/     — React Admin panel (port 3001)
├── scripts/
│   ├── deploy.sh                      — production deploy script
│   └── autopull.sh                    — auto-deploy watcher (systemd)
├── docker-compose.yml                 — development
├── docker-compose.prod.yml            — production
├── nginx.vps.conf.example             — nginx config template for VPS
└── .env.prod.example                  — production env template
```

---

## Local development

### Prerequisites

- Docker + Docker Compose
- Node.js 20+ (for running admin panel outside Docker)

### 1. Clone

```bash
git clone git@github.com:mprocner/warhammer-battle-helper.git
cd warhammer-battle-helper
```

### 2. JWT keys

```bash
mkdir -p warhammer-battle-helper-backend/keys
openssl genrsa -out warhammer-battle-helper-backend/keys/private.pem 2048
openssl rsa -in warhammer-battle-helper-backend/keys/private.pem -pubout \
  -out warhammer-battle-helper-backend/keys/public.pem
```

### 3. Backend env

```bash
cp warhammer-battle-helper-backend/.env.example warhammer-battle-helper-backend/.env
# edit as needed — defaults work for local Docker setup
```

### 4. Admin env

```bash
cp warhammer-battle-helper-admin/.env.example warhammer-battle-helper-admin/.env
# REACT_APP_API_URL=http://localhost:8080  (already set)
```

### 5. Start

```bash
docker compose up --build
```

| Service       | URL                       |
|---------------|---------------------------|
| Frontend      | http://localhost:3000     |
| Admin panel   | http://localhost:3001     |
| Backend API   | http://localhost:8080     |
| Mongo Express | http://localhost:8082     |

### First admin account

After registration and email activation, promote your account to admin:

```bash
docker exec -it warhammer-battle-helper-mongo-1 \
  mongosh "mongodb://root:example@localhost:27017/battle_helper?authSource=admin"
```

```js
db.users.updateOne(
  { email: "your@email.com" },
  { $set: { isAdmin: true } }
)
```

Log out and log back in — your new JWT will contain `is_admin: true`. Admin panel available at http://localhost:3001.

---

## Useful commands

```bash
# Start (dev)
docker compose up --build

# Start in background
docker compose up -d --build

# Stop
docker compose down

# Logs — all services
docker compose logs -f

# Logs — specific service
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f admin

# Rebuild single service
docker compose up --build backend

# Remove containers and volumes (WARNING: deletes all data)
docker compose down -v
```

---

## Production deployment

See [DEPLOY.md](DEPLOY.md) for full production setup instructions including nginx, SSL, automated deploys and backups.

---

## Architecture (production)

```
Internet
    │
    ▼
┌──────────────────────┐
│   nginx (host)       │  :80 → redirect HTTPS
│   reverse proxy      │  :443
└──────┬───────────────┘
       │
  ┌────┼────────┬──────────────┐
  ▼    ▼        ▼              ▼
:3000 :3001   :8080          :8081
Frontend Admin  Backend      Mongo Express
(React) (React  (Go + WS)    (internal only)
        Admin)      │
                    ▼
                 :27017
                MongoDB
                (internal)
```
