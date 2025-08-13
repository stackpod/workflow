import { Box } from "@stackpod/box"
import { execActions, execExpression, getActionType } from "../execute.js"
import { dblog } from "../utils.js"
import chalk from "chalk"

const cm = chalk.magenta
const cy = chalk.yellow
const cr = chalk.red
const cg = chalk.green

export const altAction = (value, state, locals, traversals) => {
  let workflowName = locals.workflowName
  let action = locals.action
  locals.vars["$error"] = value
  dblog(locals, `${locals.l2s(2)}DEBUG: Action (${cy(getActionType(action))}) Start for ${cm(workflowName)}->${cm(action.name)}`)

  const logresult = (err, res) => {
    dblog(locals, `${locals.l2s(2)}DEBUG: Action (${cy(getActionType(action))}) End <${err ? cr("Err") : cg("Ok")}> for ${cm(workflowName)}->${cm(action.name)}`, err ? cr(err) : cy(res))
    return res
  }

  if (action.alt.ok) {
    return execExpression("alt", action.alt.ok, state, locals, traversals)
      .map(ret => {
        if (action.alt.store) {
          locals.vars[action.alt.store] = ret
        }
        return ret
      })
      .bimap(ret => logresult(true, ret), ret => logresult(false, ret))
  }
  else if (action.alt.error)
    return execExpression("alt", action.alt.error, state, locals, traversals).chain(x => Box.Err(x))
      .bimap(ret => logresult(true, ret), ret => logresult(false, ret))
  else if (action.alt.actions)
    return execActions(action.alt.actions, state, locals, traversals)
      .bimap(ret => logresult(true, ret), ret => logresult(false, ret))
  else {
    ret = `Unsupported params for <alt> action. Should be One of 'ok' or 'error'`
    logresult(false, ret)
    return Box.Err(ret)
  }
}
