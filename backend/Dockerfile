# Education Consultancy API (build context: the project root, so workspace lockfiles are used).
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace education-consultancy-backend --include-workspace-root=false

FROM deps AS build
COPY backend backend
RUN npm run build --workspace education-consultancy-backend

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace education-consultancy-backend --include-workspace-root=false --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist backend/dist
# Private uploads live on a volume, writable only by the unprivileged user.
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 5100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:5100/api/health || exit 1
CMD ["node", "backend/dist/server.js"]
