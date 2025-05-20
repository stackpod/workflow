#!/bin/bash

DIR=$(dirname -- "${BASH_SOURCE[0]}")
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)

VERSION=0.24.0

echo "DIR is $DIR, ABSDIR=$ABSDIR"

cd $DIR/engine
bun build -e @elastic/elasticsearch -e ajv src/dbindex.ts -e js-yaml --target node --outfile ../worker/src/lib/dbindex.js

cd $DIR

if [[ $1 == "final" ]]; then
  docker buildx build --platform linux/amd64,linux/arm64 -f Dockerfile.worker --push -t registry.stackpod.io/workflow/worker:$VERSION -t registry.stackpod.io/workflow/worker:latest .
  docker buildx build --platform linux/amd64,linux/arm64 -f Dockerfile.engine --push -t registry.stackpod.io/workflow/engine:$VERSION -t registry.stackpod.io/workflow/engine:latest .
else
  docker build -t workflow/engine -f Dockerfile.engine .
  docker build -t workflow/worker -f Dockerfile.worker .
fi
