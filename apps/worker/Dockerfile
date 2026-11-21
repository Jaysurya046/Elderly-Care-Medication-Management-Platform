FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@12.21.0 --activate

FROM base AS builder
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/email/package.json ./packages/email/

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm db:generate
RUN pnpm --filter @elder-care/core build
RUN pnpm --filter @elder-care/worker build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app ./

CMD ["pnpm", "--filter", "@elder-care/worker", "start"]
