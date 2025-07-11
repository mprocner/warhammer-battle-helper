FROM golang:1.24-alpine3.22
LABEL authors="mateuszprocner"

WORKDIR /app

COPY ./src ./

RUN go mod download

RUN go install github.com/swaggo/swag/cmd/swag@latest
RUN swag init

RUN go build -o /battle-helper


CMD [ "/battle-helper" ]