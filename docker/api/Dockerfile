FROM node:14-alpine

WORKDIR /usr/src/api-app

COPY ./package*.json ./
RUN npm install

COPY ./src/common ./src/common
COPY ./src/api ./src/api

CMD [ "node", "src/api/index.js" ]

