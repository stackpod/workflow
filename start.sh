#!/bin/bash

DIR=$(dirname -- "${BASH_SOURCE[0]}")
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)

if [[ $1 == "stop" ]]; then
  echo "Stopping engine and worker"
  docker stop -t0 engine && docker rm engine
  docker stop -t0 w1 && docker rm w1
  exit
fi

echo "Stopping engine and worker"
docker stop -t0 engine && docker rm engine
docker stop -t0 w1 && docker rm w1

if [[ $1 == "final" ]]; then
  IMG_PREFIX="registry.stackpod.io/workflow"
  docker pull $IMG_PREFIX/engine:latest
  docker pull $IMG_PREFIX/worker:latest
else
  IMG_PREFIX="workflow"
fi

docker run --name engine -h engine -itd \
  -e ELASTICSEARCH_URL=https://es:9200 \
  -e ELASTICSEARCH_USERNAME=elastic \
  -e ELASTICSEARCH_PASSWORD=elastic \
  -e ELASTICSEARCH_TLS_REJECT_UNAUTHORIZED=false \
  -p 3010:3000 \
  --net jog \
  $IMG_PREFIX/engine:latest

docker run --name w1 -h w1 -itd \
  -e ELASTICSEARCH_URL=https://es:9200 \
  -e ELASTICSEARCH_USERNAME=elastic \
  -e ELASTICSEARCH_PASSWORD=elastic \
  -e ELASTICSEARCH_TLS_REJECT_UNAUTHORIZED=false \
  -p 3011:3000 \
  -v $DIR/examples/config.yaml:/config.yaml \
  --net jog \
  $IMG_PREFIX/worker:latest \
  --name w1 \
  --engineUrl http://engine:3000 \
  --myurl http://w1:3000 \
  -c /config.yaml
