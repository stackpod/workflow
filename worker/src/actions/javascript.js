import { Box } from "@stackpod/box"
import * as R from "ramda"
import chalk from "chalk"
import { ErrorToString } from "../utils.js"
import vm from "node:vm"
import Module from "node:module"
const require = Module.createRequire(import.meta.url)

const cm = chalk.magenta
const cy = chalk.yellow
const cr = chalk.red
const cg = chalk.green


export const jsAction = (state, locals, traversals) => {
  let workflowName = locals.workflowName
  let action = locals.action
  let code = ""
  if (R.is(String, action.js)) code = action.js
  else if (R.is(Object, action.js) && action.js.inline) code = action.js.inline

  const logresult = (err) => (res) => {
    console.log(`${locals.l2s(4)}DEBUG js action Workflow:${cm(workflowName)} Action:${cm(action?.name || "js")} Result:${err ? cr(res) : cy(JSON.stringify(res))}`)
    return res
  }

  let vars = {
    ...locals.vars,
    ...traversals,
    state: {
      ...state.wstate,
    },
  }

  let ctx = {
    ...vars,
    Ok: (value) => ({ Ok: value }),
    Err: (value) => ({ Err: value }),
    require,
  }

  let box
  try {
    vm.createContext(ctx)
    let ncode = code
    ncode += "\n\nvar vars = JSON.parse('" + JSON.stringify(vars) + "')\n"
    ncode += "main(vars)\n"
    let ret = vm.runInContext(ncode, ctx)
    if (ret.Ok) box = Box.Ok(ret.Ok)
    if (ret.Err) box = Box.Err(ret.Err)

  }
  catch (err) {
    box = Box.Err(`ERROR: Exception during javascript execution Workflow: ${workflowName} Action:${action?.name || "js"}, Err:${ErrorToString(err)}`)
      .bimap(logresult(true), logresult(false))
  }
  return box
    .map(ret => {
      if (action.store) {
        locals.vars[action.store] = ret
      }
      return ret
    })
    .bimap(logresult(true), logresult(false))
}

