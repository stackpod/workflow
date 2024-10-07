import { Box } from "@stackpod/box"
import * as R from "ramda"

export const evalJavascript = (key, value, state, workflowName, action) => {
  return Box.Ok(value)
}
