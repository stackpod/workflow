import { Box } from "@stackpod/box"
import * as R from "ramda"
import { ErrorToString, safeFetched } from "../utils.js"
import { execExpression } from "../execute.js"

export const restApiWorkflow = (args, level) => {
  let state
  args.request = args._request
  args.response = args._response

  let locals = createLocals("core.restapi", level)

  return Box.getState()
    .map(_state => { state = _state; return undefined })
    .chain(() => safeFetched(args))
    .chain(result => args.process
      ? execExpression("process", args.process, state, { ...locals, ...state, vars: { ...result } }, {})
      : Box(result.body)
    )
    .bimap(ErrorToString, R.identity)
}
