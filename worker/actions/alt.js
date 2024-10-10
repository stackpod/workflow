import { Box } from "@stackpod/box"
import { execExpression, getActionType } from "../execute.js"

export const altAction = (value, state, action) => {
  let workflowName = state.workflowName
  state.workspace["$error"] = value
  console.log(`DEBUG: Execute Action (${getActionType(action)}) Start for ${workflowName}->${action.name}`)

  if (action.alt.ok) {
    return execExpression("alt", action.alt.ok, state)
      .map(ret => {
        if (action.store) {
          state.workspace[action.store] = ret
        }
        return ret
      })
  }
  else if (action.alt.error) return execExpression("alt", action.alt.ok, state).chain(x => Box.Err(x))

  // TODO about $python and $js
}
