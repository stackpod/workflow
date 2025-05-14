import { Box } from "@stackpod/box"
import * as R from "ramda"
import { execExpression } from "../execute.js"
import chalk from "chalk"
import { dblog } from "../utils.js"

const cm = chalk.magenta
const cy = chalk.yellow
const cr = chalk.red
const cg = chalk.green

export const handleResult = (state, locals, traversals) => {
  let workflowName = locals.workflowName

  const logresult = (res) => {
    dblog(locals, `${locals.l2s(2)}DEBUG: ${cy("result")} for ${cm(workflowName)} result:`, cy(JSON.stringify(res)))
    return res
  }
  if (!state.workflows[workflowName].result) {
    return Box.Ok("Ok")
      .map(logresult)
  }
  if (R.is(String, state.workflows[workflowName].result)) {
    return execExpression("result", state.workflows[workflowName].result, state, locals, traversals)
      .map(logresult)
  }
  if (R.is(Object, state.workflows[workflowName].result)) {
    let res = {}
    let result = JSON.parse(JSON.stringify(state.workflows[workflowName].result))
    return Box.Ok(Object.entries(result))
      .traverse(([key, value]) => {
        return execExpression(key, value, state, locals, traversals)
          .map(ret => {
            res[key] = ret
            return res
          })
      })
      .map(() => res)
      .map(logresult)
  }
  return Box.Err(`ERROR: Workflow ${workflowName} has invalid type of "result" definition. Should be either string or object`)
}
