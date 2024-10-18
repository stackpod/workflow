import { Box } from "@stackpod/box"
import { execExpression, getActionType } from "../execute.js"
import chalk from "chalk"

const cm = chalk.magenta
const cy = chalk.yellow
const cr = chalk.red
const cg = chalk.green

export const altAction = (value, state, locals, traversals) => {
  let workflowName = locals.workflowName
  let action = locals.action
  locals.vars["$error"] = value
  console.log(`${locals.l2s(2)}DEBUG: Action (${cy(getActionType(action))}) Start for ${cm(workflowName)}->${cm(action.name)}`)

  const logresult = (res, err) => {
    console.log(`${locals.l2s(2)}DEBUG: Action (${cy(getActionType(action))}) End <${err ? cr("Err") : cg("Ok")}> for ${cm(workflowName)}->${cm(action.name)}`, err ? cr(err) : cy(res))
    return res
  }

  if (action.alt.ok) {
    return execExpression("alt", action.alt.ok, state, locals, traversals)
      .map(ret => {
        if (action.store) {
          locals.vars[action.store] = ret
        }
        return ret
      })
      .bimap(ret => logresult(ret, ret), ret => logresult(ret))
  }
  else if (action.alt.error)
    return execExpression("alt", action.alt.ok, state, locals, traversals).chain(x => Box.Err(x))
      .bimap(ret => logresult(ret, ret), ret => logresult(ret))

  // TODO about $python and $js
}
