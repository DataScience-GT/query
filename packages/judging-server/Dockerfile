FROM node:22-bookworm-slim

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY tooling ./tooling
COPY packages ./packages
COPY sites ./sites

RUN pnpm install --frozen-lockfile --filter @query/judging-server...

EXPOSE 8787
CMD ["pnpm", "--filter", "@query/judging-server", "start"]
