FROM node:22-alpine
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont tar
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build && tar -czf /tmp/source.tar.gz --exclude=node_modules --exclude=dist --exclude=sandbox-data --exclude=.git . && mv /tmp/source.tar.gz /app/arca-source.tar.gz
ENV NODE_ENV=production PORT=3035 CHROMIUM_PATH=/usr/bin/chromium-browser
EXPOSE 3035
CMD ["npm","start"]
