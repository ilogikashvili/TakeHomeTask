FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache --upgrade openssl=3.5.8-r0
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache --upgrade openssl=3.5.8-r0 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma ./prisma
EXPOSE 3000
USER node
CMD ["node", "dist/src/main.js"]
