FROM node:16

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 8002

CMD [ "npm","start" ]
