import { Box } from "@stackpod/box"
import * as R from "ramda"
import chalk from "chalk"
import vm from "node:vm"
import { safeJsonParse, dblog } from "../utils.js"
import Module from "node:module"
const require = Module.createRequire(import.meta.url)

const cm = chalk.magenta
const cy = chalk.yellow
const cr = chalk.red

const defaultRequires = {}

export const evalJavascript = (key, value, state, locals, traversals) => {
  let workflowName = locals.workflowName
  let action = locals.action

  const logresult = (err) => (res) => {
    dblog(locals, `${locals.l2s(4)}DEBUG js expr Workflow:${cm(workflowName)} Action:${cm(action?.name || "noname")} Key:${cm(key)} Result:${err ? cr(res) : cy(JSON.stringify(res))}`)
    return res
  }

  if (Object.keys(defaultRequires).length === 0) {
    if (state.config?.javascript?.defaultRequires && state.config.javascript.defaultRequires.length) {
      state.config.javascript.defaultRequires.forEach(req => {
        try {
          defaultRequires[req] = require(req)
        }
        catch (err) { }
      })

    }
  }

  const vars = {
    ...locals.vars,
    ...traversals,
    state: {
      ...state.wstate,
    },
    ...defaultRequires,
    require,
    process
  }
  let res, expression
  if (R.is(Object, value) && value.$js) expression = value.$js
  else {
    return Box.Err(`ERROR Invalid js input. Workflow: ${workflowName} Action:${action?.name || "noname"} Key:${key} Expr:${value} Error:$js not present`)
  }
  try {
    vm.createContext(vars)
    res = vm.runInContext(expression, vars)
  }
  catch (err) {
    if (R.is(Object, value) && value.default) {
      return Box.Ok(value.default)
        .map(logresult())
    }
    else {
      return Box.Err(`ERROR parsing js template. Workflow: ${workflowName} Action:${action?.name || "noname"} Key:${key} Expr:${expression} Error:${err.message}`)
        .bimap(logresult(true), logresult(false))
    }
  }

  if (R.is(Object, value) && value.jsonParse) {
    return safeJsonParse(res)
      .alt(err => {
        if (value.default) return Box.Ok(value.default)
        return Box.Err(`ERROR parsing JSON string from js template. Workflow: ${workflowName} Action:${action?.name || "noname"} Key:${key} Expr:${value.$jq} Error:${err}`)
      })
      .bimap(logresult(true), logresult(false))
  }
  return Box.Ok(res)
    .map(logresult())

}
