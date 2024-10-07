const { Command, Option, argParser } = require("commander")

const program = new Command()
program
  .name("worker")
  .description("worker for workflow engine")
  .version("0.1.0")
  .requiredOption("-w, --workflows <path>", "yaml file or a directory having multiple yaml files", ".")
  .addOption(new Option("-l, --listen [port]", "listen on this port for commands").preset(8080).argParser(parseInt))
  .action((options) => {
    if(Number.isNaN(options.listen)) {
      console.error("Invalid number provided for listen port")
      process.exit(1)
    }
  })

program.parse()

const options = program.opts()
console.log(options)

