FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --include=dev

COPY . .

# Public build-time values only. Secrets stay in the runtime environment.
ARG VITE_API_BASE_URL
ARG VITE_APP_ENV=production
ARG VITE_APP_NAME=ExApp
ARG VITE_STRAVA_CLIENT_ID
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_APP_ENV=$VITE_APP_ENV \
    VITE_APP_NAME=$VITE_APP_NAME \
    VITE_STRAVA_CLIENT_ID=$VITE_STRAVA_CLIENT_ID

RUN node scripts/build-hosted.mjs

ENV NODE_ENV=production
CMD ["npm", "run", "server:start"]
