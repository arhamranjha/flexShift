# Build context: repository root
#   docker build -f apps/backend-api/Dockerfile -t flexshift-api .
FROM node:22-alpine AS build
RUN apk add --no-cache openssl && corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/backend-api ./apps/backend-api
RUN pnpm install --frozen-lockfile --filter backend-api...
RUN pnpm --filter backend-api exec prisma generate && pnpm --filter backend-api build

FROM node:22-alpine
RUN apk add --no-cache openssl && corepack enable
WORKDIR /repo
ENV NODE_ENV=production
# The full workspace is copied so the prisma CLI is available to run `migrate deploy` on start.
COPY --from=build /repo ./
WORKDIR /repo/apps/backend-api
EXPOSE 4000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
