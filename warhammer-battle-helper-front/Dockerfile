FROM node:24-alpine
LABEL authors="mateuszprocner"

WORKDIR /app

# Copy package.json and package-lock.json
COPY ./package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your application files
COPY . .


CMD [ "npm", "start"]