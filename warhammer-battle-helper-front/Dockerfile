FROM node:24-alpine
LABEL authors="mateuszprocner"

WORKDIR /app

# Copy package.json and package-lock.json
COPY ./src/package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your application files
COPY ./src .


CMD [ "npm", "start"]