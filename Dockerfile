FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies
RUN cd server && npm install
RUN cd client && npm install

# Copy source code
COPY . .

# Build client
RUN cd client && npm run build

# Generate Prisma client
RUN cd server && npx prisma generate

# Expose port
EXPOSE ${PORT:-3001}

# Start server
CMD cd server && npx prisma migrate deploy && node src/index.js
