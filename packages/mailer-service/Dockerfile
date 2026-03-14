FROM node:20-alpine

WORKDIR /app

COPY packages/mailer-service/package.json ./package.json

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate && pnpm i --prod

COPY packages/mailer-service/src ./src

ENV PORT=8787

EXPOSE 8787

CMD ["pnpm", "start"]

