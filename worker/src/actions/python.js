import { Box } from "@stackpod/box"
import * as R from "ramda"
import chalk from "chalk"
import { ErrorToString, safeJsonParse, safeSpawn } from "../utils.js"
import path from "node:path"

const cm = chalk.magenta
const cy = chalk.yellow
const cr = chalk.red


export const pythonAction = (state, locals, traversals) => {
  let workflowName = locals.workflowName
  let action = locals.action
  let code = ""
  if (R.is(String, action.python)) code = action.python
  else if (R.is(Object, action.python) && action.python.inline) code = action.python.inline

  const logresult = (err) => (res) => {
    console.log(`${locals.l2s(4)}DEBUG python Workflow:${cm(workflowName)} Action:${cm(action?.name || "python")} Result:${err ? cr(res) : cy(JSON.stringify(res))}`)
    return res
  }

  let vars = {
    ...locals.vars,
    ...traversals,
    state: {
      ...state.wstate,
    }
  }

  let input = `
from python.Bunch import Bunch
from python.Result import Result
Ok = Result.Ok
Err = Result.Err

vars = Bunch.fromDict(${JSON.stringify(vars)})
code = """
from python.Result import Result
Ok = Result.Ok
Err = Result.Err

${code.trim()}
"""

g = {}
exec(code, g, g)
ret = g["main"](vars)
print(ret)
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
    .chain(ret => {
      return safeJsonParse(ret)
        .alt(err => {
          return Box.Err(`ERROR parsing JSON string from python response. Workflow: ${workflowName} Action:${action?.name || "python"} Key:${key} Expr:${value.$python} Error:${ErrorToString(err)}`)
        })
        .chain(ret => {
          if (ret.Ok) return Box.Ok(ret.Ok)
          if (ret.Err) return Box.Err(ret.Err)
        })
    })
    .map(ret => {
      if (action.store) {
        locals.vars[action.store] = ret
      }
      return ret
    })
    .bimap(logresult(true), logresult(false))
}

