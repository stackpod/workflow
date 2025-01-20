import { Box } from "@stackpod/box"
import * as R from "ramda"
import { Agent } from "undici"
import { createLocals, ErrorToString, safeFetched } from "../utils.js"
import { execExpression } from "../execute.js"
import { constructArgs } from "../actions/actions.js"

export const restApiWorkflow = (args, level) => {
  let state
  args.request = args._request
  args.response = args._response

  if (args.request.allowUntrustedCertificates) {
    args.request.dispatcher = new Agent({
      connect: { rejectUnauthorized: false }
    })
    delete args.request.allowUntrustedCertificates
  }

  let locals = createLocals("core.restapi", level)

  return Box.getState()
    .map(_state => { state = _state; return undefined })
    .chain(() => safeFetched(args))
    .chain(result => args.process
      ? execExpression("process", args.process, state, { ...locals, vars: { ...result } }, {})
      : Box(result.body)
    )
    .bimap(ErrorToString, R.identity)
}
