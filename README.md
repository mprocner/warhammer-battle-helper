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

## Monitoring (production) — CPU and memory charts

The production stack runs a [Netdata](https://www.netdata.cloud/) agent (`netdata` service in
`docker-compose.prod.yml`). It charts CPU, memory, disk and per-process usage for the host and for
every container at 1-second resolution, and stores the history locally in the `netdata-lib` volume.
Open source (GPLv3), no account and no cloud connection required.

Main use case: measure what a single live game session costs, then estimate how many concurrent
sessions the VPS can host.

### 1. Close the port first (one-off, on the VPS)

The service uses `network_mode: host`, which is needed for network interface metrics but also makes
port 19999 listen on **every** interface, including the public IP — unlike dozzle and mongo-express,
which bind to `127.0.0.1`. The dashboard is unauthenticated and exposes process names, users, OS
version and container topology. Block the port before the container is ever started:

```bash
sudo ufw deny 19999
sudo ufw status | grep 19999
```

### 2. Deploy

```bash
# on the VPS
./scripts/deploy.sh
```

`deploy.sh` does `git reset --hard origin/main`, so the change must be merged into `main` first.
The Netdata image is pulled, not built (~200 MB on the first deploy).

### 3. View the charts through an SSH tunnel

From your own machine:

```bash
ssh -L 19999:127.0.0.1:19999 ubuntu@playrpg.net
```

`127.0.0.1` inside the tunnel is resolved **on the server** — it means "port 19999 on the remote
loopback". That is why the tunnel works despite `ufw deny 19999`: the traffic arrives on loopback,
which the firewall does not filter.

Then open <http://localhost:19999>. Nothing is added to the nginx config — Netdata's dashboard does
not proxy cleanly under a subpath, and the tunnel keeps the port closed to the internet.

Useful sections of the dashboard:

- **Docker containers** / **cgroups** — CPU and memory per container (`backend`, `mongo`, `frontend`)
- **System overview** — host CPU, RAM, load average
- **Applications** — per-process breakdown (needs `pid: host`, already set)

Container CPU is shown relative to **all** cores: 180% on a 4-core VPS is 45% of the machine.
Memory includes page cache — the honest number is the working set, and MongoDB will look large
because WiredTiger claims up to 50% of host RAM as cache by default.

### 4. How to measure one session

1. Leave the stack idle for ~10 minutes — that is the baseline
2. Start a game session and add players one at a time
3. Each join shows up as a step on the chart; the step height is the cost of one session
4. `max_sessions ≈ (total_RAM × 0.75 − baseline) / per_session` — repeat for CPU and file descriptors

### Retention and configuration

History is stored in three tiers: 1-second, 1-minute and 1-hour samples, each kept for a different
length of time. Old sessions survive at lower resolution, so **write the measured per-session cost
down** instead of expecting to zoom back into 1-second data weeks later.

```bash
# check actual retention
curl -s localhost:19999/api/v1/info | python3 -m json.tool | grep -i -A3 retention

# edit config (retention sizes, disable cloud, notifications)
docker exec -it warhammer-battle-helper-netdata-1 bash /etc/netdata/edit-config netdata.conf

# apply changes
docker compose -f docker-compose.prod.yml --env-file .env.prod restart netdata
```

Alerts (including RAM and disk thresholds) run inside the agent — Netdata Cloud is not needed for
them. Notification targets live in `health_alarm_notify.conf`.

Note: `docker compose down -v` deletes `netdata-lib` along with `mongo-data`. Without `-v` both survive.

The service is deliberately **not** in the local `docker-compose.yml`: on macOS `/proc` and `/sys`
come from the Docker Desktop VM, so the charts would describe that VM rather than the host. Use
`docker stats` locally.

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

Outside the nginx path, reachable only over an SSH tunnel:

```
:9999   dozzle   — container logs (also proxied at /logs, IP whitelisted)
:19999  netdata  — CPU/RAM charts (host network, firewalled, tunnel only)
```
