import { Box } from "@stackpod/box"
import * as R from "ramda"
import chalk from "chalk"
import { ErrorToString, safeJsonParse, safeSpawn, dblog } from "../utils.js"
import path from "node:path"

const cm = chalk.magenta
const cy = chalk.yellow
const cr = chalk.red
const cg = chalk.green


export const pythonAction = (state, locals, traversals) => {
  let workflowName = locals.workflowName
  let action = locals.action
  let code = ""
  if (R.is(String, action.python)) code = action.python
  else if (R.is(Object, action.python) && action.python.inline) code = action.python.inline

  const logresult = (err) => (res) => {
    dblog(locals, `${locals.l2s(4)}DEBUG python Workflow:${cm(workflowName)} Action:${cm(action?.name || "python")} Result:${err ? cr(res) : cy(JSON.stringify(res))}`)
    return res
  }

  let vars = {
    ...locals.vars,
    ...traversals,
    state: {
      ...state.wstate,
    }
  }

  let separator = "d8d255f006348e960940794aaeb06ca8"

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

${code.trim().replaceAll('"""', '\\"\\"\\"')}
"""

g = {}
exec(code, g, g)
ret = g["main"](vars)
print("${separator}")
print(ret)
`

  const options = {
    input: input.trim(),
    shell: false
  }

  return safeSpawn("python3", [], options)
    .chain(ret => {
      if (ret.stderr.length) return Box.Err(`ERROR: Exception during python execution Workflow: ${workflowName} Action:${action?.name || "python"}, ${ret.stdout + ret.stderr}`)
      else {
        dblog(locals, `${locals.l2s(4)} STDOUT from python program Workflow: ${workflowName} Action:${action?.name || "python"}: ${cg(ret.stdout.slice(0, ret.stdout.indexOf(separator)).trim())}`)
        return Box.Ok(ret.stdout.slice(ret.stdout.indexOf(separator) + separator.length + 1).trim())
      }
    })
    .chain(ret => {
      return safeJsonParse(ret)
        .alt(err => {
          return Box.Err(`ERROR parsing JSON string from python response. Workflow: ${workflowName} Action:${action?.name || "python"} Ret:${ret} Error:${ErrorToString(err)}`)
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

