FROM node:18 AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies (clean install for correct native bindings)
RUN cd server && npm install
RUN cd client && npm install

# Copy source code
COPY . .

# Build client
RUN cd client && npm run build

# Generate Prisma client
RUN cd server && npx prisma generate

# --- Production stage ---
FROM node:18-alpine

WORKDIR /app

# Copy server with dependencies
COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist

EXPOSE ${PORT:-3001}

CMD ["sh", "-c", "cd server && npx prisma migrate deploy && node src/index.js"]
