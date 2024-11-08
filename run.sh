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
