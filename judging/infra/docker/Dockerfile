FROM node:22-bookworm-slim

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY tooling ./tooling
COPY judging ./judging
COPY packages ./packages
COPY sites ./sites

RUN pnpm install --frozen-lockfile --filter @panel/server...

EXPOSE 8787
CMD ["pnpm", "--filter", "@panel/server", "start"]
