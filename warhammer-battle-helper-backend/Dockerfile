FROM golang:1.25-alpine3.22

WORKDIR /app

# Dependencies (go.mod/go.sum live in src/)
COPY ./src/go.mod ./src/go.sum ./
RUN go mod download

# Hot reload & swagger tools
RUN go install github.com/air-verse/air@latest
RUN go install github.com/swaggo/swag/cmd/swag@latest

# Copy config files (if any) used by air
COPY ./src/.air.toml ./

# Create data dir for SQLite (mounted as volume)
RUN mkdir -p /app/data

# Default command (source is mounted at runtime)
CMD ["air"]