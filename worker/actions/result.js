import { Box } from "@stackpod/box"
import { execExpression } from "../execute.js"

export const handleResult = (state) => {
  let workflowName = state.workflowName

  const clearWorkflowState = (res) => {
    delete state.workspaces[state.workspace]
    state.workspace = null
    return res
  }

  if (!state.workflows[workflowName].result) {
    return Box.Ok("Ok")
      .map(clearWorkflowState)
  }
  if (R.is(String, state.workflows[workflowName].result)) {
    return execExpression("result", state.workflows[workflowName].result, state, workflowName, {})
      .map(clearWorkflowState)
  }
  if (R.is(Object, state.workflows[workflowName].result)) {
    let res = {}
    return Box.Ok(Object.entries(state.workflows[workflowName].result))
      .traverse(([key, value]) => {
        return execExpression(key, value, state.workflows[workflowName].result, state, workflowName, {})
          .map(ret => {
            res[key] = ret
            return res
          })
      })
      .map(() => res)
      .map(clearWorkflowState)
  }
  clearWorkflowState(null)
  return Box.Err(`ERROR: Workflow ${workflowName} has invalid type of "result" definition. Should be either string or object`)
}
