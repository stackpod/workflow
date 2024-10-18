import { Box } from "@stackpod/box"
import * as R from "ramda"
import nunjucks from "nunjucks"
import chalk from "chalk"

const cm = chalk.magenta
const cy = chalk.yellow

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

nenv.addFilter("dateStr", () => new nenv.filters.safe(new Date()))
nenv.addFilter("dateTm", () => Date.now() / 1000)


export const evalJinja = (key, value, state, locals, traversals) => {
  let workflowName = locals.workflowName
  let action = locals.action

  const logresult = (res) => {
    console.log(`${locals.l2s(4)}DEBUG Jinja Workflow:${cm(workflowName)} Action:${cm(action?.name || "noname")} Key:${cm(key)} Result:${cy(JSON.stringify(res))}`)
    return res
  }

  let vars = {
    ...locals.vars,
    ...traversals,
    state: {
      ...state.wstate,
    }
  }
  let res, expression
  if (R.is(String, value)) expression = value
  else if (R.is(Object, value) && value.$jinja) expression = value.$jinja

  try {
    res = nenv.renderString(expression, { ...vars, $_all: { ...locals.vars } }).trim()
  }
  catch (err) {
    if (R.is(Object, value) && value.default) return Box.Ok(value.default)
    return Box.Err(`ERROR parsing Jinja template. Workflow: ${workflowName} Action:${action?.name || "noname"} Key:${key} Expr:${expression} Error:${err.message}`)
      .bimap(logresult, logresult)
  }

  if (R.is(Object, value) && value.jsonParse) {
    try {
      let jres = JSON.parse(res)
      return Box.Ok(jres)
        .map(logresult)
    }
    catch (err) {
      if (value.default) return Box.Ok(value.default)
      return Box.Err(`ERROR parsing JSON string from Jinja response. Workflow: ${workflowName} Action:${action?.name || "noname"} Key:${key} Expr:${value} res:${res} Error:${err.message}`)
        .bimap(logresult, logresult)
    }
  }
  return Box.Ok(res)
    .map(logresult)
}
