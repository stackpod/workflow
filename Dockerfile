FROM node:22-alpine

RUN apk add jq curl bash tzdata python3 py3-pip && \
  python3 -m venv /usr/local/pyvenv && \
  source /usr/local/pyvenv/bin/activate && \
  pip install pyyaml

ENV VIRTUAL_ENV_DISABLE_PROMPT=1
ENV VIRTUAL_ENV="/usr/local/pyvenv"
ENV PATH="/usr/local/pyvenv/bin/:$PATH"

RUN mkdir -p /examples /yaml /app/src

COPY worker/package.json /app/package.json
WORKDIR /app

RUN npm install

COPY examples/workflows /examples/
COPY worker/src /app/src/

ENTRYPOINT ["node", "src/worker.js"]
