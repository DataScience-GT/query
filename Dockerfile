# Use an official Node.js image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your app
COPY . .

# Expose Next.js default port
EXPOSE 3000

# Run the dev server
CMD ["npm", "run", "dev"]
