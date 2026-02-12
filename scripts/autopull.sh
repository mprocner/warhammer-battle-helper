#!/bin/bash

# Auto-deploy watcher
# Checks for new commits every 5 minutes and runs deploy.sh if updates are found

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BRANCH="main"
CHECK_INTERVAL=300 # 5 minutes in seconds

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

cd "$PROJECT_DIR" || { log_error "Cannot cd to $PROJECT_DIR"; exit 1; }

log "Auto-deploy watcher started"
log "Watching branch: $BRANCH"
log "Check interval: ${CHECK_INTERVAL}s"
log "Project dir: $PROJECT_DIR"

while true; do
    log "Checking for new commits..."

    git fetch origin "$BRANCH"
    if [ $? -ne 0 ]; then
        log_error "git fetch failed, retrying next cycle"
        sleep "$CHECK_INTERVAL"
        continue
    fi

    LOCAL=$(git rev-parse "$BRANCH")
    REMOTE=$(git rev-parse "origin/$BRANCH")

    if [ "$LOCAL" != "$REMOTE" ]; then
        log "New commits detected! Local: ${LOCAL:0:8} Remote: ${REMOTE:0:8}"
        log "Running deploy.sh..."

        if bash "$SCRIPT_DIR/deploy.sh"; then
            log "Deploy completed successfully"
        else
            log_error "Deploy failed with exit code $?"
        fi
    else
        log "No new commits. Current: ${LOCAL:0:8}"
    fi

    sleep "$CHECK_INTERVAL"
done
