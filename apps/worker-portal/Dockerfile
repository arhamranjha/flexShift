# Build context: repository root  (docker build -f apps/worker-portal/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example.com .)
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/worker-portal ./apps/worker-portal
RUN pnpm install --frozen-lockfile --filter worker-portal...
# NEXT_PUBLIC_* values are baked into the client bundle at build time.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter worker-portal build

FROM node:22-alpine
RUN corepack enable
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo ./
EXPOSE 3001
CMD ["pnpm", "--filter", "worker-portal", "start"]
