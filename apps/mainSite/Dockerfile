FROM node:latest AS build

WORKDIR /app
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.* ./
COPY eslint.config.* ./
COPY src ./src
COPY public ./public

RUN npm ci
RUN npm run build

FROM node:latest AS serve
WORKDIR /app

RUN npm install -g serve
COPY --from=build /app/dist ./dist

EXPOSE 4173
CMD ["serve", "-s", "dist", "-l", "4173"]
