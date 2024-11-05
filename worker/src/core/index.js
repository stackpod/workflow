import { Box } from "@stackpod/box"
import * as R from "ramda"
import { restApiWorkflow } from "./restapi.js"
import { cronWorkflow } from "./cron.js"
import { sendEmailWorkflow } from "./sendemail.js"
import { getEmailWorkflow } from "./getemail.js"
import { rabbitMqPublish, rabbitMqRecv, rabbitMqSend, rabbitMqSubscribe } from "./rabbitmq.js"

export const coreWorkflows = (workflowName, args, level) => {

  if (workflowName === "core.restapi") return restApiWorkflow(args, level)
  else if (workflowName === "core.scheduler") return cronWorkflow(args, level)
  else if (workflowName === "core.sendemail") return sendEmailWorkflow(args, level)
  else if (workflowName === "core.getemail") return getEmailWorkflow(args, level)
  else if (workflowName === "core.rabbitmq.send") return rabbitMqSend(args, level)
  else if (workflowName === "core.rabbitmq.recv") return rabbitMqRecv(args, level)
  else if (workflowName === "core.rabbitmq.publish") return rabbitMqPublish(args, level)
  else if (workflowName === "core.rabbitmq.subscribe") return rabbitMqSubscribe(args, level)

  else return Box.Err(`ERROR: Unknown workflow ${workflowName}`)

}
