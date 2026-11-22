# 1) Costruzione della PWA
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV VITE_KAVITA_STESSA_ORIGINE=1
RUN npm run build

# 2) Caddy serve l'app e inoltra /api a Kavita (stesso indirizzo, niente CORS)
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
