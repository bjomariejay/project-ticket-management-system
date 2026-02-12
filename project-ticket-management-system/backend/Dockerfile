FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY src ./src
COPY db-init.sql ./db-init.sql
EXPOSE 4000
CMD ["node", "src/server.js"]
