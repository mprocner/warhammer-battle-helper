# Deployment Guide

This guide covers deploying Warhammer Battle Helper to a VPS using Docker.

## Prerequisites

- VPS with Ubuntu (20.04+)
- Docker and Docker Compose installed
- Nginx installed (as reverse proxy)
- Domain pointing to your VPS (optional but recommended)

### Install Docker (if not installed)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group changes to take effect
```

## Deployment Steps

### 1. Clone the Repository

```bash
# Using SSH (requires SSH key added to GitHub)
sudo git clone git@github.com:mprocner/warhammer-battle-helper.git /opt/warhammer-battle-helper
sudo chown -R $USER:$USER /opt/warhammer-battle-helper

# Or using HTTPS
sudo git clone https://github.com/mprocner/warhammer-battle-helper.git /opt/warhammer-battle-helper
sudo chown -R $USER:$USER /opt/warhammer-battle-helper

cd /opt/warhammer-battle-helper
```

### 2. Create Environment File

```bash
cp .env.prod.example .env.prod
nano .env.prod
```

Update the values:

```env
# Your domain (used by frontend to call API)
REACT_APP_API_URL=https://yourdomain.com/api

# MongoDB credentials (CHANGE THESE!)
MONGO_USER=root
MONGO_PASSWORD=your-secure-password-here
MONGO_DB_NAME=battle_helper

# CORS - your domain(s)
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

### 3. Generate JWT Keys

```bash
mkdir -p warhammer-battle-helper-backend/keys
openssl genrsa -out warhammer-battle-helper-backend/keys/private.pem 2048
openssl rsa -in warhammer-battle-helper-backend/keys/private.pem -pubout \
  -out warhammer-battle-helper-backend/keys/public.pem
```

### 4. Build and Run with Docker Compose

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Verify containers are running:

```bash
docker compose -f docker-compose.prod.yml ps
```

### 5. Configure Nginx (Host)

Copy the example config:

```bash
sudo cp nginx.vps.conf.example /etc/nginx/sites-available/warhammer
sudo nano /etc/nginx/sites-available/warhammer
```

Update `server_name` with your domain, then enable:

```bash
sudo ln -s /etc/nginx/sites-available/warhammer /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. SSL Certificate (Recommended)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

## Updating the Application

```bash
cd /opt/warhammer-battle-helper
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

## Useful Commands

```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f

# View specific service logs
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend

# Restart services
docker compose -f docker-compose.prod.yml restart

# Stop all services
docker compose -f docker-compose.prod.yml down

# Stop and remove volumes (WARNING: deletes data)
docker compose -f docker-compose.prod.yml down -v
```

## Troubleshooting

### Check if containers are running

```bash
docker compose -f docker-compose.prod.yml ps
```

### Check container logs for errors

```bash
docker compose -f docker-compose.prod.yml logs backend
docker compose -f docker-compose.prod.yml logs frontend
```

### Test backend health

```bash
curl http://localhost:8080/health
```

### Test frontend

```bash
curl http://localhost:3000/health
```

### MongoDB connection issues

Ensure MongoDB is running and credentials match:

```bash
docker compose -f docker-compose.prod.yml logs mongo
```

### CORS errors

Make sure `ALLOWED_ORIGINS` in `.env.prod` includes your domain.

## Architecture

```
Internet
    │
    ▼
┌─────────────────┐
│  Nginx (Host)   │  :80/:443
│  Reverse Proxy  │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌───────┐
│Frontend│ │Backend│
│ :3000  │ │ :8080 │
│ (nginx)│ │ (Go)  │
└───────┘ └───┬───┘
              │
              ▼
         ┌───────┐
         │MongoDB│
         │ :27017│
         └───────┘
```

## Ports

| Service  | Internal Port | Exposed Port | Description          |
|----------|---------------|--------------|----------------------|
| Frontend | 80            | 3000         | React app via nginx  |
| Backend  | 8080          | 8080         | Go API + WebSocket   |
| MongoDB  | 27017         | -            | Database (internal)  |
