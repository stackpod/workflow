import { Box } from "@stackpod/box"
import * as R from "ramda"

export const evalPython = (key, value, state, workflowName, action) => {
  return Box.Ok(value)
}
