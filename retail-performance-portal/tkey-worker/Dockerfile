FROM mcr.microsoft.com/playwright:v1.65.1-jammy

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV NODE_ENV=production
ENV HEADLESS=true
EXPOSE 4000

CMD ["node", "server.mjs"]
