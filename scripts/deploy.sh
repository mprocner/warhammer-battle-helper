#!/bin/bash
set -e

# Deployment script for warhammer-battle-helper
# Run this on your VPS to pull changes and rebuild

# Configuration
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

cd "$PROJECT_DIR"

# Check if env file exists
if [ ! -f "$ENV_FILE" ]; then
    log_error "Environment file $ENV_FILE not found!"
    log_info "Copy .env.prod.example to .env.prod and configure it first"
    exit 1
fi

log_info "Starting deployment in $PROJECT_DIR"

# Backup database before deployment
BACKUP_DIR="$HOME/mongo-backups"
BACKUP_FILE="$BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).archive"
mkdir -p "$BACKUP_DIR"

log_info "Backing up database to $BACKUP_FILE..."
if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps mongo | grep -q "Up"; then
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T mongo \
        mongodump --uri "mongodb://$(grep MONGO_USER "$ENV_FILE" | cut -d= -f2):$(grep MONGO_PASSWORD "$ENV_FILE" | cut -d= -f2)@localhost:27017/?authSource=admin" \
        --archive > "$BACKUP_FILE"
    log_info "Backup saved to $BACKUP_FILE"
    # Keep only last 7 backups
    ls -t "$BACKUP_DIR"/*.archive 2>/dev/null | tail -n +8 | xargs -r rm
else
    log_warn "Mongo not running, skipping backup"
fi

# Backup volumes before deployment
VOLUMES_BACKUP_DIR="$HOME/volume-backups"
BACKUP_TIMESTAMP=$(date +%Y%m%d-%H%M%S)
for vol in avatars user-files music-files; do
    MOUNTPOINT=$(docker volume inspect "warhammer-battle-helper_backend-$vol" --format '{{.Mountpoint}}' 2>/dev/null)
    if [ -n "$MOUNTPOINT" ]; then
        log_info "Backing up volume $vol..."
        DEST="$VOLUMES_BACKUP_DIR/$vol/$BACKUP_TIMESTAMP"
        mkdir -p "$DEST"
        sudo rsync -a "$MOUNTPOINT/" "$DEST/"
        ls -dt "$VOLUMES_BACKUP_DIR/$vol"/[0-9]* 2>/dev/null | tail -n +6 | xargs -r sudo rm -rf
    fi
done

# Pull latest changes
log_info "Pulling latest changes from git..."
git fetch origin
git reset --hard origin/main

# Build and restart containers
log_info "Building and restarting containers..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache

log_info "Stopping old containers..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down

log_info "Starting new containers..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

# Cleanup old images and build cache
log_info "Cleaning up unused Docker images and build cache..."
docker image prune -f
docker builder prune -a -f

log_info "Deployment complete!"
log_info "Checking container status..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
