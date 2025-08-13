import { Command, Option } from "commander"
import { Box } from "@stackpod/box"
import chalk from "chalk"
import { endAndRemove, execute, runningWorkflows } from "./execute.js"
import { EventEmitter } from "events"
import express from "express"
import { conciseStringify, getExecId } from "./utils.js"
import { default as crocks } from "crocks"
const { isFunction } = crocks
import { envConfig } from "./lib/dbindex.js"
import { loadConfig } from "./config.js"

const program = new Command()
program
  .name("worker")
  .description("worker for workflow engine")
  .version("0.24")
  .requiredOption("-n, --name <str>", "Name of the worker node, only short names like w1")
  .requiredOption("-e, --engineUrl <str>", "URL of the Engine without trailing slash ex: http://engine:3000")
  .requiredOption("-u, --myurl <str>", "URL of this work how Engine will access it ex: http://worker:3001")
  .option("-w, --path <str>", "yaml file or a directory having multiple yaml files")
  .option("-c, --config <str>", "configuration yaml file")
  .addOption(new Option("-l, --listen [port]", "listen on this port for commands").preset(3000).argParser(parseInt))
  .option("-r, --workflows  [string...]", "specify the workflows to run")
  .action((options) => {
    if (Number.isNaN(options.listen)) {
      console.error("Invalid number provided for listen port")
      process.exit(1)
    }
  })

program.parse()

const options = program.opts()

global.workerName = options.name
const wopts = { workflowsPath: options.path, configFile: options.config }

EventEmitter.defaultMaxListeners = Infinity
Error.stackTraceLimit = Infinity
// Box.debug = true

const execWf = (workflow, execId, wargs = {}) => {
  let b = Box()
    .map(() => console.log(chalk.blue(`${workflow} start`)))
    .chain(() => {
      try {
        return execute(workflow, execId, wopts, wargs)
      } catch (err) {
        console.log(`Error starting workflow ${workflow} with execId ${execId} ${err.message}`, err)
        return Box.Err(`Error starting workflow ${workflow} with execId ${execId} ${err.message}`)
      }
    })
    .bimap(
      (ret) => console.log(chalk.blue(`${execId} - Outcome -> `) + chalk.red(ret)),
      (ret) => console.log(chalk.blue(`${execId} - Outcome -> `) + chalk.blue(conciseStringify(ret))
      )
    )
  // console.log(chalk.blue(`${workflow} - Outcome -> `) + (Box.isOk(b) ? chalk.blue(JSON.stringify(b.toValue())) : chalk.red(b.toValue())))
  return b
}

let localExecId = 1
if (options.workflows) {
  let cancelFn = null
  localExecId += 1
  let box = await Box(options.workflows)
    .traverse(wf => execWf(wf, localExecId), Box.TraverseAllSettled, Box.TraverseSeries)
    .runPromise(undefined, Box.pairToBox, (cancel) => cancelFn = cancel)

  if (Box.isErr(box)) console.log(box.inspect())
  process.exit(1)
}

const app = express()
app.use(express.urlencoded({ extended: false }))
app.use(express.json())
const port = options.listen || 3000
const MAX_EXEC_WORKFLOWS = 200
const cancelFunctions = {}

app.get("/worker/workflow/exec/running", async (req, res) => {
  res.json({ status: "ok", running: runningWorkflows })
})

// Run a workflow
app.post("/worker/workflow/exec/run/:workflowId", async (req, res) => {
  try {
    let workflowId = req.params.workflowId

    if (Object.keys(runningWorkflows).length >= MAX_EXEC_WORKFLOWS)
      return res.status(500).send(`Max concurrent workflows execution exceeded, currentWorkflows:${currentWorkflows.length}`)

    let execId = getExecId("api", workflowId)

    const wargs = req.body

    let box = Box(workflowId)
      .chain(wf => execWf(wf, execId, wargs))

    if (req.query.asynch === true || req.query.asynch === "yes" || req.query.asynch === "y" || req.query.asynch === "true") {
      box
        .runPromise(undefined, Box.pairToBox, (cancelFn) => cancelFunctions[execId] = cancelFn)
        .then(res => {
          console.log(`ExecId - ${execId} completed successfully with res:${conciseStringify(res)}`)
        })
        .catch(err => {
          console.log(`ExecId - ${execId} failed with errors ${err}`)
        })
        .finally(async () => {
          if (execId in cancelFunctions) delete cancelFunctions[execId]
          if (execId in runningWorkflows) {
            await endAndRemove(execId, true, "possibly got cancelled")
            console.log(`ExecId - ${execId} possibly got cancelled`)
          }
        })
      return res.json({ status: "ok", async: true, execId: execId, message: `To get the status, check with /workflow/exec/status/${execId}` })
    }
    else {
      await box
        .bimap(
          err => res.status(500).send({ status: "error", execId: execId, error: err }),
          ok => res.json({ status: "ok", execId: execId, result: ok })
        )
        .runPromise(undefined, Box.pairToBox, (cancelFn) => cancelFunctions[execId] = cancelFn)
        .finally(async () => {
          if (execId in cancelFunctions) delete cancelFunctions[execId]
          if (execId in runningWorkflows) {
            await endAndRemove(execId, true, "possibly got cancelled")
            console.log(`ExecId - ${execId} possibly got cancelled`)
          }
        })
    }
  }
  catch (err) {
    console.log(`ERROR while executing workflow ${req.params.workflowId}, error:`, err)
    res.status(500).send(`ERROR: while executing workflow ${req.params.workflowId} error:${err.toString()}`)
  }
})

// Cancel a workflow
app.post("/worker/workflow/exec/cancel/:execId", async (req, res) => {
  let execId = req.params.execId
  if (!cancelFunctions[execId])
    return res.status(404).send(`ERROR: ExecId ${req.params.execId} not present in this worker`)

  if (isFunction(cancelFunctions[execId])) {
    cancelFunctions[execId]()
    return res.status(200).json({ status: "ok", message: `ExecId ${req.params.execId} successfully cancelled. Please wait few secs for the execution to actually stop` })
  }
})

var engineConnectivity = {}

app.get("/worker/healthcheck", (req, res) => {
  engineConnectivity.status = "ok"
  engineConnectivity.lastModified = new Date()
  return res.json({ status: "ok", worker: options.name })
})

const registerWorker = () => {
  if (engineConnectivity.status != "ok" || new Date() - engineConnectivity.lastModified > 60000) {
    fetch(new Request(options.engineUrl + "/worker/registration",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workerId: options.name, action: "register", workerUrl: options.myurl })
      }))
      .then(resp => resp.bytes())
      .then(data => {
        console.log("rcvd from engine", Buffer.from(data).toString())
        let j = JSON.parse(Buffer.from(data).toString())
        if (j.status === "ok") {
          engineConnectivity.status = "ok"
          engineConnectivity.lastModified = new Date()
        }
        else {
          console.log(`ERROR from engine: Received string=${Buffer.from(data).toString()}`)
        }
      })
      .catch(err => {
        console.log(`ERROR from engine: Received exception=${err.message}`)
      })
  }
}
setInterval(registerWorker, 60000)

console.log(`Listening on port ${port}`)
app.listen(port)
registerWorker()
