# Build stage
FROM node:20-alpine AS build
WORKDIR /app

# .dockerignore excludes .git, so pass the commit in:
#   docker build --build-arg GIT_SHA=$(git rev-parse --short=12 HEAD) .
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime stage
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/app.js"]

