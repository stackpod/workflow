import { Box } from "@stackpod/box"
import * as R from "ramda"
import { restApiWorkflow } from "./restapi.js"
import { cronWorkflow } from "./cron.js"

export const coreWorkflows = (workflowName, args, level) => {

  if (workflowName === "core.restapi") return restApiWorkflow(args, level)
  else if (workflowName === "core.scheduler") return cronWorkflow(args, level)

  else return Box.Err(`ERROR: Unknown workflow ${workflowName}`)

}
