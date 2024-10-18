import { Command, Option } from "commander"
import { Box } from "@stackpod/box"
import chalk from "chalk"
import { execute } from "./execute.js"

const program = new Command()
program
  .name("worker")
  .description("worker for workflow engine")
  .version("0.9.0")
  .option("-w, --path <str>", "yaml file or a directory having multiple yaml files")
  .addOption(new Option("-l, --listen [port]", "listen on this port for commands").preset(8080).argParser(parseInt))
  .requiredOption("-r, --workflows  [string...]", "specify the workflows to run")
  .action((options) => {
    if (Number.isNaN(options.listen)) {
      console.error("Invalid number provided for listen port")
      process.exit(1)
    }
  })

program.parse()

const options = program.opts()

const wopts = { workflowsPath: options.path }


const execWf = async (workflow) => {
  let b = await Box()
    .map(() => console.log(chalk.blue(`${workflow} start`)))
    .chain(() => {
      try {
        return execute(workflow, wopts)
      } catch (err) {
        return Box.Err(err.message)
      }
    })
    .runPromise()
  console.log(chalk.blue(`${workflow} - Outcome -> `) + (Box.isOk(b) ? chalk.blue(b.toValue()) : chalk.red(b.toValue())))
  return b
}

let box = await Box(options.workflows)
  .traverse(wf => execWf(wf), Box.TraverseAllSettled, Box.TraverseSeries)
  .runPromise()

if (Box.isErr(box)) console.log(box.inspect())
