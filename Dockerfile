FROM node:16

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

ENV PORT 8080
EXPOSE 8080

CMD ["node", "server.js"]
