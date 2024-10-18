import { Box } from "@stackpod/box"
import * as R from "ramda"
import chalk from "chalk"
import { safeJsonParse, safeSpawn } from "../utils.js"
import path from "node:path"

const cm = chalk.magenta
const cy = chalk.yellow
const cr = chalk.red


export const evalJq = (key, value, state, locals, traversals) => {
  let workflowName = locals.workflowName
  let action = locals.action

  const logresult = (err) => (res) => {
    console.log(`${locals.l2s(4)}DEBUG Jq Workflow:${cm(workflowName)} Action:${cm(action?.name || "noname")} Key:${cm(key)} Result:${err ? cr(res) : cy(JSON.stringify(res))}`)
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
  else if (R.is(Object, value) && value.$jq) expression = value.$jq
  else {
    return Box.Err(`ERROR Invalid jq input. Workflow: ${workflowName} Action:${action?.name || "noname"} Key:${key} Expr:${value} Error:$jq not present`)
  }
  const options = {
    input: JSON.stringify(vars),
    shell: false
  }

  const __dirname = path.dirname(new URL(import.meta.url).pathname)
  const jqFolder = path.join(__dirname, "../lib/jq")
  return safeSpawn("jq", ["-rc", `-L${jqFolder}`, 'include "utils"; ' + expression], options)
    .chain(ret => {
      if (ret.stderr.length) return Box.Err(ret.stderr)
      else return Box.Ok(ret.stdout.trim())
    })
    .alt(ret => {
      if (R.is(Object, value) && value.default) return Box.Ok(value.default)
      else {
        return Box.Err(`ERROR parsing Jq template. Workflow: ${workflowName} Action:${action?.name || "noname"} Key:${key} Expr:${expression} Error:${ret}`)
      }
    })
    .chain(ret => {
      if (R.is(Object, value) && value.jsonParse !== false && ret != value.default) {
        return safeJsonParse(ret)
          .alt(err => {
            if (value.default) return Box.Ok(value.default)
            return Box.Err(`ERROR parsing JSON string from Jq response. Workflow: ${workflowName} Action:${action?.name || "noname"} Key:${key} Expr:${value.$jq} Error:${err}`)
          })
      }
      return Box.Ok(ret)
    })
    .bimap(logresult(true), logresult(false))
}
