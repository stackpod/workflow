import { Box } from "@stackpod/box"
import { execExpression } from "../execute.js"

export const altAction = (value, state, action) => {
  state.workspace[$error] = value

  if (action.alt.ok) return execExpression("alt", action.alt.ok, state)
  else if (action.alt.error) return execExpression("alt", action.alt.ok, state).chain(x => Box.Err(x))

  // TODO about $python and $js
}
