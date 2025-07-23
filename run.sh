examples=(example.jinja.simple.1 example.jinja.simple.2 example.jinja.simple.3 example.jinja.simple.4 example.jinja.simple.5)
examples+=(example.jq.simple.1 example.jq.simple.2 example.jq.simple.3 example.jq.simple.4 example.jq.simple.5 example.jq.simple.6)
examples+=(example.js.simple.1 example.js.simple.2 example.js.simple.3)
examples+=(example.state.1)
examples+=(example.conditionals.1)
examples+=(example.traverse.series.1 example.traverse.series.2 example.traverse.series.3 example.traverse.series.4)
examples+=(example.traverse.parallel.1 example.traverse.parallel.2 example.traverse.parallel.3)
examples+=(example.traverse.while.1 example.traverse.while.2)
examples+=(example.sleep.1)
examples+=(example.restapi.1 example.restapi.2 example.restapi.3)
examples+=(example.restapi.4 example.restapi.5 example.restapi.6)
examples+=(example.python.expression.1 example.python.expression.2 example.python.expression.3)
examples+=(example.python.action.1 example.python.action.2)
examples+=(example.js.action.1)
examples+=(example.sendemail.1)
examples+=(example.getemail.1 example.getemail.2)

if [[ $1 == "docker" ]]; then
  docker pull registry.stackpod.io/workflow/worker:latest
  if [[ ! -d "examples" ]]; then
    echo "Please move into the root directory of the workflow and run this command"
    exit
  fi
else
  if [[ ! -e "src/worker.js" ]]; then
    echo "Please move into the worker directory of the workflow and run this command"
    exit
  fi
fi

for example in "${examples[@]}"; do
  echo "Running $example"
  if [[ $1 == "docker" ]]; then
    docker run --rm -it -v $PWD/examples/config.yaml:/config.yaml registry.stackpod.io/workflow/worker:latest -w /examples -c /config.yaml -r $example
  else
    node src/worker.js -w ../examples/workflows -c ../examples/config.yaml -r $example
  fi
done

exit
docker run --rm -it -v $PWD/examples/config.yaml:/config.yaml registry.stackpod.io/workflow/worker:latest -w /examples -c /config.yaml -r example.sendemail.1
docker run --rm -it -v $PWD/examples/config.yaml:/config.yaml registry.stackpod.io/workflow/worker:latest -w /examples -c /config.yaml -r example.getemail.1 example.getemail.2
docker run --rm -it -v $PWD/examples/config.yaml:/config.yaml registry.stackpod.io/workflow/worker:latest -w /examples -c /config.yaml -r example.python.expression.1 example.python.expression.2 example.python.expression.3
docker run --rm -it -v $PWD/examples/config.yaml:/config.yaml registry.stackpod.io/workflow/worker:latest -w /examples -c /config.yaml -r example.python.action.1 example.python.action.2
docker run --rm -it -v $PWD/examples/config.yaml:/config.yaml registry.stackpod.io/workflow/worker:latest -w /examples -c /config.yaml -r example.js.action.1
node src/worker.js -w ../examples/workflows -r example.jinja.simple.1 example.jinja.simple.2 example.jinja.simple.3 example.jinja.simple.4 example.jinja.simple.5
node src/worker.js -w ../examples/workflows -r example.jq.simple.1 example.jq.simple.2 example.jq.simple.3 example.jq.simple.4 example.jq.simple.5 example.jq.simple.6
node src/worker.js -w ../examples/workflows -r example.js.simple.1 example.js.simple.2 example.js.simple.3
node src/worker.js -w ../examples/workflows -r example.state.1
node src/worker.js -w ../examples/workflows -r example.conditionals.1
node src/worker.js -w ../examples/workflows -r example.traverse.series.1 example.traverse.series.2 example.traverse.series.3
node src/worker.js -w ../examples/workflows -r example.traverse.parallel.1 example.traverse.parallel.2
node src/worker.js -w ../examples/workflows -r example.sleep.1
node src/worker.js -w ../examples/workflows -r example.restapi.1 example.restapi.2 example.restapi.3
node src/worker.js -w ../examples/workflows -c ../examples/config.yaml -r example.sendemail.1
node src/worker.js -w ../examples/workflows -c ../examples/config.yaml -r example.getemail.1 example.getemail.2
node src/worker.js -w ../examples/workflows -c ../examples/config.yaml -r example.python.expression.1 example.python.expression.2 example.python.expression.3
node src/worker.js -w ../examples/workflows -c ../examples/config.yaml -r example.python.action.1 example.python.action.2
node src/worker.js -w ../examples/workflows -c ../examples/config.yaml -r example.js.action.1
