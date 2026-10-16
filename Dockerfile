# ---- Build stage: install all deps and compile TypeScript ----
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage: production deps + compiled JS only ----
FROM node:24-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/app/data/todo.db
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# The SQLite file lives in /app/data, which docker-compose mounts as a volume.
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Run node directly (not via npm) so SIGTERM reaches the app and it shuts down cleanly.
CMD ["node", "dist/main.js"]
