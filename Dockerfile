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

WORKDIR /app

COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist

EXPOSE ${PORT:-3001}

CMD ["sh", "-c", "cd server && npx prisma migrate deploy && node src/index.js"]
