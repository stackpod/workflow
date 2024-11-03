FROM node:22-alpine

RUN apk add jq curl bash tzdata

RUN mkdir -p /examples /yaml /app/src

COPY worker/package.json /app/package.json
WORKDIR /app

RUN npm install

COPY examples/workflows /examples/
COPY worker/src /app/src/

ENTRYPOINT ["node", "src/worker.js"]
