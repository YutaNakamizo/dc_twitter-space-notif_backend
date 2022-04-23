FROM node:14.19.1-alpine3.15

WORKDIR /usr/src/api-app/

COPY ./package*.json ./
RUN npm ci

COPY ./src/ ./src/

ENV TZ="Asia/Tokyo"

ENV GOOGLE_APPLICATION_CREDENTIALS=""
ENV NOTIF_TARGETS=""

ENV ALLOW_ORIGIN=""

CMD [ "node", "src/index.js" ]

