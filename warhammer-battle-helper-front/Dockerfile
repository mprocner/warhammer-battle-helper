FROM node:24-alpine
LABEL authors="mateuszprocner"

WORKDIR /app

# Copy package.json and package-lock.json
COPY ./package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your application files
COPY . .

# Ensure port is open for dev server
EXPOSE 3000


CMD [ "npm", "start"]

#
#RUN mkdir -p /app && chown -R node:node /app
#
## Utworzenie katalogu aplikacji i ustawienie uprawnień
#WORKDIR /app
#
## Copy package.json and package-lock.json
#COPY ./package*.json ./
#
## Zainstaluj zależności jako root
#RUN npm install && \
#    mkdir -p node_modules/.cache && \
#    chmod -R 777 node_modules/
#
## Przełącz na użytkownika node dla bezpieczeństwa
#USER node
#
#COPY ./ ./
#
#EXPOSE 3000
#
#CMD ["npm", "start"]
