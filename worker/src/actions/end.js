import { Box } from "@stackpod/box"
import { execExpression, getActionType } from "../execute.js"
import { dblog } from "../utils.js"
import chalk from "chalk"

const cm = chalk.magenta
const cy = chalk.yellow
const cr = chalk.red
const cg = chalk.green

export const endAction = (state, locals, traversals) => {
  let workflowName = locals.workflowName
  let action = locals.action
  locals.ended = true
  dblog(locals, `${locals.l2s(2)}DEBUG: Action (${cy(getActionType(action))}) Start for ${cm(workflowName)}->${cm(action.name)}`)

  const logresult = (res, err) => {
    dblog(locals, `${locals.l2s(2)}DEBUG: Action (${cy(getActionType(action))}) End <${err ? cr("Err") : cg("Ok")}> for ${cm(workflowName)}->${cm(action.name)}`, err ? cr(err) : cy(res))
    return res
  }

  if (action.end.ok) {
    return execExpression("end", action.end.ok, state, locals, traversals)
      .map(ret => {
        if (action.store) {
          locals.vars[action.store] = ret
        }
        return ret
      })
      .bimap(ret => logresult(ret, ret), ret => logresult(ret))
  }
  else if (action.end.error)
    return execExpression("end", action.end.error, state, locals, traversals).chain(x => Box.Err(x))
      .bimap(ret => logresult(ret, ret), ret => logresult(ret))
  else {
    ret = `Unsupported params for <end> action. Should be One of 'ok' or 'error'`
    logresult(ret, ret)
    return Box.Err(ret)
  }

  // TODO about $python and $js
}
