import { Box } from "@stackpod/box"
import * as R from "ramda"
import nunjucks from "nunjucks"

nunjucks.installJinjaCompat()

var nenv = new nunjucks.Environment({}, { autoescape: false })

nenv.addFilter("url_params", (url, params) => {
  var p = R.is(Object, params) ? Object.entries(params).map(([k, v]) => `${k}=${v}`).join("&") : ""
  if (p.length) return url + "?" + p
  return new nunjucks.SafeString(url)
})
nenv.addFilter("toJson", (obj) => {
  return new nenv.filters.safe(JSON.stringify(obj))
})

export const evalJinja = (key, value, state, workflowName, action) => {
  console.log(`DEBUG Jinja Workflow:${workflowName} Action:${action?.name || "noname"} Key:${key} Vars:${JSON.stringify(state.workspace)}`)
  let vars = {
    ...state.workspace,
    state: {
      ...state.wstate,
    }
  }
  let res, expression
  if (R.is(String, value)) expression = value
  else if (R.is(Object, value) && value.$jinja) expression = value.$jinja

  try {
    res = nenv.renderString(expression, { ...vars, $_all: { ...state.workspace } }).trim()
  }
  catch (err) {
    if (R.is(Object, value) && value.default) return Box.Ok(value.default)
    return Box.Err(`ERROR parsing Jinja template. Workflow: ${workflowName} Action:${action?.name || "noname"} Key:${key} Expr:${value} Error:${err.message}`)
  }

  if (R.is(Object, value) && value.jsonParse) {
    try {
      let jres = JSON.parse(res)
      return Box.Ok(jres)
    }
    catch (err) {
      if (value.default) return Box.Ok(value.default)
      return Box.Err(`ERROR parsing JSON string from Jinja response. Workflow: ${workflowName} Action:${action?.name || "noname"} Key:${key} Expr:${value} res:${res} Error:${err.message}`)
    }
  }
  return Box.Ok(res)
}
