FROM node:14-alpine

WORKDIR /usr/src/notif-app

COPY ./package*.json ./
RUN npm install
COPY ./src/ ./src/

CMD [ "node", "src/index.js" ]

