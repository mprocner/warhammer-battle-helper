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

# Pull latest changes
log_info "Pulling latest changes from git..."
git pull origin main

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
