FROM node:18-slim

# Arguments for build time configuration
ARG NODE_ENV=production

# Create app directory
WORKDIR /usr/src/app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends postgresql-client netcat-traditional && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install app dependencies - incluye tanto dependencias de producción como de desarrollo
COPY package*.json ./
RUN npm ci

# Bundle app source
COPY . .

# Create needed directories
RUN mkdir -p logs
RUN mkdir -p ./src/infrastructure/database/seeds

# Set up the entrypoint script
COPY docker-entrypoint.sh /usr/src/app/
RUN chmod +x /usr/src/app/docker-entrypoint.sh

# Environment variables
ENV NODE_ENV=$NODE_ENV

# Expose port
EXPOSE 3000

# Use the entrypoint script to initialize the app
ENTRYPOINT ["/usr/src/app/docker-entrypoint.sh"]
