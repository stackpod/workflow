import { Box } from "@stackpod/box"
import { execExpression } from "../execute.js"

export const assertAction = (key, value, state, workflowName, action) => {
  return execExpression(key, value, state, workflowName, action)
    .chain(ret => {
      if (state.workspace[key] == ret) {
        return Box.Ok(state)
      }
      else {
        return Box.Err(`ERROR: Assert failure, ${key} Expected value: ${value} Actual value: ${state.workspace[key]} Evaled value: ${ret}`)
      }
    })
}
