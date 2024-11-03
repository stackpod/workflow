import { Box } from "@stackpod/box"
import * as R from "ramda"
import { restApiWorkflow } from "./restapi.js"
import { cronWorkflow } from "./cron.js"
import { sendEmailWorkflow } from "./sendemail.js"
import { getEmailWorkflow } from "./getemail.js"

export const coreWorkflows = (workflowName, args, level) => {

  if (workflowName === "core.restapi") return restApiWorkflow(args, level)
  else if (workflowName === "core.scheduler") return cronWorkflow(args, level)
  else if (workflowName === "core.sendemail") return sendEmailWorkflow(args, level)
  else if (workflowName === "core.getemail") return getEmailWorkflow(args, level)

  else return Box.Err(`ERROR: Unknown workflow ${workflowName}`)

}
