import { Box } from "@stackpod/box"
import * as R from "ramda"
import { execActions, execExpression, execute } from "../execute.js"
import chalk from "chalk"
import { dblog } from "../utils.js"

const cm = chalk.magenta
const cy = chalk.yellow
const cr = chalk.red
const cg = chalk.green

export const conditionalsAction = (state, locals, traversals) => {
  let workflowName = locals.workflowName
  let action = locals.action

  const logresult = (err, idx) => (res) => {
    dblog(locals, `${locals.l2s(4)}DEBUG Conditionals Workflow:${cm(workflowName)} Action:${cm(action?.name || "noname")} Index: ${idx} Result:${err ? cr(res) : cy(JSON.stringify(res))}`, res)
    return res
  }

  const evalTruthy = (ret) => ret === "true" || ret === true ? true : false

  let resolved = false
  let box = Box.Ok()

  action.conditionals.map((conditional, idx) => {
    if (conditional.condition) {
      box = box.chain((ret) => {
        if (resolved) return Box.Ok(ret)
        else return execExpression("conditional", conditional.condition, state, locals, traversals)
          .bimap(logresult(true, idx), logresult(false, idx))
          .bichain(
            ret => { resolved = true; return Box.Err(ret) },
            ret => {
              if (evalTruthy(ret)) {
                resolved = true
                return execActions(conditional.actions, state, locals, traversals)
              }
              return Box(ret)
            })
      })
    } else {
      box = box.chain((ret) => {
        if (resolved) return Box.Ok(ret)
        resolved = true
        return execActions(conditional.actions, state, locals, traversals)
      })
    }
  })
  return box
}

