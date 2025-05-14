// @ts-nocheck
import { Box } from "@stackpod/box"
import * as R from "ramda"
import { createLocals, ErrorToString, getExecId, safeFetched, dblog } from "../utils.js"
import { execExpression, executeWorkflow } from "../execute.js"
import cron from "node-cron"
import { constructArgs } from "../actions/actions.js"
import chalk from "chalk"

const cm = chalk.magenta
const cy = chalk.yellow
const cr = chalk.red
const cg = chalk.green

export const cronWorkflow = (execId, args, level) => {
  let state
  args.request = args._request
  args.response = args._response


  return Box.getState()
    .map(_state => { state = _state; return undefined })
    .chain(() => {
      let timer = '' +
        // '*/6 ' +
        (args.minute || '*') + ' ' +
        (args.hour || '*') + ' ' +
        (args.date || '*') + ' ' +
        (args.month || '*') + ' ' +
        (args.week || '*')
      if (!(args.workflow && args.workflow.name)) return Box.Err(`ERROR: No workflow provided for core.scheduler`)
      let locals = createLocals("core.scheduler", execId, level)

      cron.schedule(timer, () => {
        try {
          constructArgs(args.workflow?.args || {}, state, locals, {})
            .map(x => {
              dblog(locals, `${locals.l2s()}DEBUG: core.scheduler ${cy("Workflow")} Start for ${cm(args.workflow.name)}`)
              return x
            })
            .chain(_args => {
              // We don't create new execId, but use the existing execId only
              // let execId = getExecId("cron", args.workflow.name)
              return executeWorkflow(args.workflow.name, execId, _args, level + 1)
            })
            .bimap(err => {
              dblog(locals, `${locals.l2s()}DEBUG: core.scheduler ${cy("Workflow")} End <${cr("Err")}> for ${cm(args.workflow.name)} Err:${ErrorToString(err)}`)
            }, ret => {
              dblog(locals, `${locals.l2s()}DEBUG: core.scheduler ${cy("Workflow")} End <${cg("Ok")}> for ${cm(args.workflow.name)} Ret:${ret}`)
            })
            .run(R.identity, state)
        }
        catch (err) {
          dblog(locals, `${locals.l2s()}DEBUG: core.scheduler ${cy("Workflow")} End <${cr("Err")}> for ${cm(args.workflow.name)} Err:${ErrorToString(err)}`)
        }
      })
      return Box()
    })
    .bimap(err => {
      dblog(locals, `${locals.l2s()}DEBUG: core.scheduler ${cy("Workflow")} Could not be setup Err:${ErrorToString(err)}`)
    }, R.identity)
}
