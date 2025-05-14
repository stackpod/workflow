import { Box } from "@stackpod/box"
import * as R from "ramda"
import { restApiWorkflow } from "./restapi.js"
import { cronWorkflow } from "./cron.js"
import { sendEmailWorkflow } from "./sendemail.js"
import { getEmailWorkflow } from "./getemail.js"
import { rabbitMqPublish, rabbitMqRecv, rabbitMqSend, rabbitMqSubscribe } from "./rabbitmq.js"

export const coreWorkflows = (workflowName, execId, args, level) => {

  if (workflowName === "core.restapi") return restApiWorkflow(execId, args, level)
  else if (workflowName === "core.scheduler") return cronWorkflow(execId, args, level)
  else if (workflowName === "core.sendemail") return sendEmailWorkflow(execId, args, level)
  else if (workflowName === "core.getemail") return getEmailWorkflow(execId, args, level)
  else if (workflowName === "core.rabbitmq.send") return rabbitMqSend(execId, args, level)
  else if (workflowName === "core.rabbitmq.recv") return rabbitMqRecv(execId, args, level)
  else if (workflowName === "core.rabbitmq.publish") return rabbitMqPublish(execId, args, level)
  else if (workflowName === "core.rabbitmq.subscribe") return rabbitMqSubscribe(execId, args, level)

  else return Box.Err(`ERROR: Unknown workflow ${workflowName}`)

}
