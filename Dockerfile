FROM node:14-alpine

WORKDIR /usr/src/notif-app

COPY ./package*.json ./
RUN npm install

COPY ./src/ ./src/
RUN mkdir ./src/tmp && echo '{}' >> ./src/tmp/state.json

CMD [ "node", "src/index.js" ]

