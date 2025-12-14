FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy app code
COPY . .

# Expose port
EXPOSE 4000

# Run migrations and start server
CMD ["sh", "-c", "node src/migrate.js && node src/index.js"]
