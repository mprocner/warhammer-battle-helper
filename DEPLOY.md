# Deployment Guide

Production deployment on VPS using Docker + nginx.

---

## Prerequisites

- Ubuntu 20.04+ VPS
- Domain pointing to the VPS
- Docker and Docker Compose
- nginx + Certbot

### Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group changes to take effect
```

### Install nginx + Certbot

```bash
sudo apt install nginx certbot python3-certbot-nginx
```

---

## First-time setup

### 1. Clone the repository

```bash
sudo git clone git@github.com:mprocner/warhammer-battle-helper.git /opt/warhammer-battle-helper
sudo chown -R $USER:$USER /opt/warhammer-battle-helper
cd /opt/warhammer-battle-helper
```

### 2. Create environment file

```bash
cp .env.prod.example .env.prod
nano .env.prod
```

Key values to update:

```env
REACT_APP_API_URL=https://yourdomain.com/api
MONGO_USER=root
MONGO_PASSWORD=your-secure-password-here
MONGO_DB_NAME=battle_helper
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
ADMIN_BASENAME=/admin
```

### 3. Generate JWT keys

```bash
mkdir -p warhammer-battle-helper-backend/keys
openssl genrsa -out warhammer-battle-helper-backend/keys/private.pem 2048
openssl rsa -in warhammer-battle-helper-backend/keys/private.pem -pubout \
  -out warhammer-battle-helper-backend/keys/public.pem
```

### 4. Configure nginx

```bash
sudo cp nginx.vps.conf.example /etc/nginx/sites-available/warhammer
sudo nano /etc/nginx/sites-available/warhammer
```

Update:
- `server_name` — your domain(s)
- `YOUR_IP` in `/admin/` and `/mongo-admin/` blocks — your home IP (whitelist)

```bash
sudo ln -s /etc/nginx/sites-available/warhammer /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. SSL certificate

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Certbot edits the nginx config automatically. Do not manually edit the SSL section afterwards.

### 6. Build and start containers

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

### 7. Set up first admin account

After registering and activating your account:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec mongo \
  mongosh "mongodb://$(grep MONGO_USER .env.prod | cut -d= -f2):$(grep MONGO_PASSWORD .env.prod | cut -d= -f2)@localhost:27017/$(grep MONGO_DB_NAME .env.prod | cut -d= -f2)?authSource=admin"
```

```js
db.users.updateOne(
  { email: "your@email.com" },
  { $set: { isAdmin: true } }
)
```

Log out and log in again — the new JWT will carry `is_admin: true`. Admin panel is at `https://yourdomain.com/admin/`.

---

## Updating the application

For a single manual update:

```bash
cd /opt/warhammer-battle-helper
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

---

## Automated deployment

### deploy.sh

`scripts/deploy.sh` handles:
- MongoDB database backup (keeps last 7)
- Volume backups for avatars, user-files, music-files (keeps last 5)
- `git pull`
- `docker compose build --no-cache` + restart
- Docker image and build cache cleanup

Run manually:

```bash
cd /opt/warhammer-battle-helper
bash scripts/deploy.sh
```

Or set `PROJECT_DIR` if running from elsewhere:

```bash
PROJECT_DIR=/opt/warhammer-battle-helper bash scripts/deploy.sh
```

### GitHub Actions (auto-deploy on push)

Deployment is triggered automatically on every push to `main` by the workflow
`.github/workflows/deploy.yml`:

1. **`test` job** — runs `go test ./...` on the backend (same gate as the `.githooks/pre-push` hook).
2. **`deploy` job** — only runs if tests pass. It connects to the VPS over SSH
   (`appleboy/ssh-action`) and runs `scripts/deploy.sh`, which pulls the latest code
   (`git reset --hard origin/main`), backs up the DB and volumes, rebuilds and restarts containers.

You can also trigger a manual redeploy without pushing: **Actions → Deploy → Run workflow**
(`workflow_dispatch`).

#### Required repository secrets

Set these in **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | VPS IP / domain |
| `DEPLOY_USER` | SSH user (e.g. `ubuntu`) |
| `DEPLOY_SSH_KEY` | **private** SSH key (full contents, including headers) |
| `DEPLOY_PORT` | SSH port (only if not `22`; can be omitted) |
| `DEPLOY_PROJECT_DIR` | project path on the server (e.g. `/opt/warhammer-battle-helper`) |

Generate a dedicated key pair for CI and authorize it on the server:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f deploy_key
# append deploy_key.pub to ~/.ssh/authorized_keys of DEPLOY_USER on the VPS
# paste the contents of deploy_key (private) into the DEPLOY_SSH_KEY secret
```

> **Passwordless sudo required.** `deploy.sh` uses `sudo rsync` / `sudo rm` for volume backups.
> Over a non-interactive SSH session, a sudo password prompt would abort the script (`set -e`),
> so `DEPLOY_USER` must have `NOPASSWD` sudo for those commands (or deploy as `root`).

---

## Useful commands

```bash
# Status
docker compose -f docker-compose.prod.yml --env-file .env.prod ps

# Logs — all
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f

# Logs — specific service
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f backend
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f frontend
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f admin

# Restart all
docker compose -f docker-compose.prod.yml --env-file .env.prod restart

# Restart single service
docker compose -f docker-compose.prod.yml --env-file .env.prod restart backend

# Stop all
docker compose -f docker-compose.prod.yml --env-file .env.prod down

# Stop and remove volumes (WARNING: deletes uploaded files and DB data)
docker compose -f docker-compose.prod.yml --env-file .env.prod down -v
```

---

## Backups

### Database backup (manual)

```bash
BACKUP_FILE="$HOME/mongo-backups/backup-$(date +%Y%m%d-%H%M%S).archive"
mkdir -p "$HOME/mongo-backups"
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T mongo \
  mongodump --uri "mongodb://USER:PASS@localhost:27017/?authSource=admin" \
  --archive > "$BACKUP_FILE"
```

### Database restore

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T mongo \
  mongorestore --uri "mongodb://USER:PASS@localhost:27017/?authSource=admin" \
  --archive < backup.archive
```

---

## Troubleshooting

**Backend not starting**
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs backend
# Check JWT keys exist:
ls warhammer-battle-helper-backend/keys/
```

**CORS errors**
```bash
# Verify ALLOWED_ORIGINS in .env.prod includes your domain
grep ALLOWED_ORIGINS .env.prod
```

**Admin panel 403**
- Make sure you logged out and back in after setting `isAdmin: true` — old JWT won't have the claim
- Check your IP is in the nginx whitelist in `/etc/nginx/sites-available/warhammer`

**nginx test fails**
```bash
sudo nginx -t    # shows exact error with line number
```

---

## Ports

| Service       | Container port | Host port          | Description              |
|---------------|----------------|--------------------|--------------------------|
| Frontend      | 80             | 3000               | React app (nginx)        |
| Admin panel   | 80             | 127.0.0.1:3001     | React Admin (nginx)      |
| Backend       | 8080           | 8080               | Go API + WebSocket       |
| MongoDB       | 27017          | —                  | Internal only            |
| Mongo Express | 8081           | 127.0.0.1:8081     | DB UI (internal only)    |

Admin and Mongo Express ports are bound to `127.0.0.1` — not accessible from outside, only through nginx (with IP whitelist) or SSH tunnel.

---

## Architecture

```
Internet
    │
    ▼
┌─────────────────────┐
│   nginx (host)      │  :80 → HTTPS redirect
│   reverse proxy     │  :443
└──────┬──────────────┘
       │
  ┌────┼──────────┬──────────────┐
  ▼    ▼          ▼              ▼
:3000 :3001     :8080          :8081
Frontend  Admin  Backend      Mongo Express
(React)  (React  (Go + WS)   (IP whitelist)
         Admin)      │
                     ▼
                  :27017
                 MongoDB
                (internal)
```
