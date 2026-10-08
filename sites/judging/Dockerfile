FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY tooling ./tooling
COPY packages ./packages
COPY sites ./sites

ARG NEXT_PUBLIC_PANEL_URL=http://localhost:8787
ENV NEXT_PUBLIC_PANEL_URL=$NEXT_PUBLIC_PANEL_URL

RUN pnpm install --frozen-lockfile --filter @query/judging-web...
RUN pnpm --filter @query/judging-web build

FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=build /app/sites/judging/.next/standalone ./
COPY --from=build /app/sites/judging/.next/static ./sites/judging/.next/static
COPY --from=build /app/sites/judging/public ./sites/judging/public

EXPOSE 3000
CMD ["node", "sites/judging/server.js"]
