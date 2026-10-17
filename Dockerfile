FROM node:22-slim
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .
RUN npm run build && npm test
USER node
EXPOSE 8080
CMD ["npm", "start"]
