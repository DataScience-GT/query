# =========================================
# Next.js Portal - Cloud Run Dockerfile
# =========================================
# Using pnpm with shamefully-hoist for flat node_modules

FROM node:20-alpine AS base

# Install dependencies needed for native modules
RUN apk add --no-cache libc6-compat

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# =========================================
# Stage 1: Install dependencies AND build
# =========================================
FROM base AS builder
WORKDIR /app

# Copy workspace configuration first
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy all package.json files for workspace packages
COPY packages/api/package.json ./packages/api/
COPY packages/auth/package.json ./packages/auth/
COPY packages/db/package.json ./packages/db/
COPY packages/ui/package.json ./packages/ui/
COPY sites/portal/package.json ./sites/portal/

# Create .npmrc with node-linker=hoisted for flat node_modules (no symlinks)
# This avoids ERR_MODULE_NOT_FOUND issues in standalone builds
RUN echo "node-linker=hoisted" > .npmrc

# Install all dependencies with hoisting
RUN pnpm install --frozen-lockfile

# Copy all source code after dependencies are installed
COPY packages ./packages
COPY sites/portal ./sites/portal
COPY tooling ./tooling

# Build the portal
WORKDIR /app/sites/portal
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

# =========================================
# Stage 2: Production runner
# =========================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the standalone build from builder
COPY --from=builder --chown=nextjs:nodejs /app/sites/portal/.next/standalone ./

# Copy static assets
COPY --from=builder --chown=nextjs:nodejs /app/sites/portal/.next/static ./sites/portal/.next/static

# Copy public folder
COPY --from=builder --chown=nextjs:nodejs /app/sites/portal/public ./sites/portal/public

# Copy packages to ensure symlinks in node_modules work
COPY --from=builder --chown=nextjs:nodejs /app/packages ./packages

# Copy the entire node_modules from the root to fix module resolution
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Switch to non-root user
USER nextjs

# Expose the port
EXPOSE 8080

# Start the server
CMD ["node", "sites/portal/server.js"]
