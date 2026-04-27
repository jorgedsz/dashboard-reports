FROM node:20 AS builder

WORKDIR /app

# Copy only package.json (no lockfiles)
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install client deps and remove any stale state
RUN cd client && npm install --prefer-offline=false

# Install server deps
RUN cd server && npm install

# Copy all source code
COPY . .

# Rebuild native bindings to ensure correct platform
RUN cd client && npm rebuild

# Build client
RUN cd client && npm run build

# Generate Prisma client
RUN cd server && npx prisma generate

# --- Production stage ---
FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist

# Re-generate Prisma client for Alpine (musl) target
RUN cd server && npx prisma generate

EXPOSE ${PORT:-3001}

CMD ["sh", "-c", "cd server && npx prisma db push --skip-generate && node src/index.js"]
