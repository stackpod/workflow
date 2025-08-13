#!/bin/bash

ENGINE=http://localhost:3000

if [[ $1 == "upload" ]]; then
  file=$2
  curl -s -XPOST ${ENGINE}/workflow/bulk/workflows/yaml --data-binary @$file -H "Content-type: text/plain"
  echo
fi

if [[ $1 == "list" ]]; then
  curl -s -XGET ${ENGINE}/workflow/workflows | jq -r .workflows[].workflowId
fi

if [[ $1 == "listone" ]]; then
  wf=$2
  curl -s -XGET ${ENGINE}/workflow/${wf} | jq .
fi

if [[ $1 == "run" ]]; then
  wf=$2
  OUT=$(curl -s -XPOST ${ENGINE}/workflow/exec/run/${wf}?asynch=yes -d '{"args":{}}' -H "Content-type: application/json")
  echo $OUT
  EXECID=$(echo "$OUT" | jq -r .execId)
  export EXECID
fi

if [[ $1 == "status" ]]; then
  eid=$2
  if [[ -z $eid ]]; then eid=$EXECID; fi
  curl -s -XGET ${ENGINE}/workflow/exec/status/${EXECID}?colors=true | jq -r
fi

if [[ $1 == "logs" ]]; then
  eid=$2
  if [[ -z $eid ]]; then eid=$EXECID; fi
  curl -s -XGET ${ENGINE}/workflow/exec/status/${EXECID}?colors=true | jq -r .execution.logs[]
fi

if [[ $1 == "running" ]]; then
  curl -s -XGET ${ENGINE}/workflow/exec/status?status=running
  echo
fi

if [[ $1 == "cancel" ]]; then
  curl -s -XPUT ${ENGINE}/workflow/exec/cancel/${EXECID}
  echo
fi
