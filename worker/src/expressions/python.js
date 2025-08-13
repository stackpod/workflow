import { Box } from "@stackpod/box"
import * as R from "ramda"
import chalk from "chalk"
import { safeJsonParse, safeSpawn, dblog, conciseStringify } from "../utils.js"
import path from "node:path"

const cm = chalk.magenta
const cy = chalk.yellow
const cr = chalk.red


export const evalPython = (key, value, state, locals, traversals) => {
  let workflowName = locals.workflowName
  let action = locals.action

  const logresult = (err) => (res) => {
    dblog(locals, `${locals.l2s(4)}DEBUG python Workflow:${cm(workflowName)} Action:${cm(action?.name || "noname")} Key:${cm(key)} Result:${err ? cr(res) : cy(conciseStringify(res))}`)
    return res
  }

  let vars = {
    ...locals.vars,
    ...traversals,
    state: {
      ...state.wstate,
    }
  }
  let expression
  if (R.is(String, value)) expression = value
  else if (R.is(Object, value) && value.$python) expression = value.$python
  else {
    return Box.Err(`ERROR Invalid python input. Workflow: ${workflowName} Action:${action?.name || "noname"} Key:${key} Expr:${value} Error:python not present`)
  }

  let input = `
import sys, os, json
from python.Bunch import Bunch

vars = Bunch(${JSON.stringify(vars)})
expr = """${expression.trim().replaceAll('"""', '\\"\\"\\"')}"""
print(eval(expr, globals(), vars))
`
  const options = {
    input: input.trim(),
    shell: false
  }

  return safeSpawn("python3", [], options)
    .chain(ret => {
      if (ret.stderr.length) return Box.Err(ret.stderr)
      else return Box.Ok(ret.stdout.trim())
    })
    .alt(ret => {
      if (R.is(Object, value) && value.default) return Box.Ok(value.default)
      else {
        return Box.Err(`ERROR parsing python template. Workflow: ${workflowName} Action:${action?.name || "noname"} Key:${key} Expr:${expression} Error:${ret}`)
      }
    })
    .chain(ret => {
      if (R.is(Object, value) && value.jsonParse === true && ret != value.default) {
        return safeJsonParse(ret)
          .alt(err => {
            if (value.default) return Box.Ok(value.default)
            return Box.Err(`ERROR parsing JSON string from python response. Workflow: ${workflowName} Action:${action?.name || "noname"} Key:${key} Expr:${value.$python} Error:${err}`)
          })
      }
      return Box.Ok(ret)
    })
    .bimap(logresult(true), logresult(false))
}
