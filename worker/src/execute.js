import { Box } from "@stackpod/box"
import * as R from "ramda"
import { loadWorkflows } from "./parser.js"

import { evalJinja } from "./expressions/jinja.js"
import { evalJq } from "./expressions/jq.js"
import { evalPython } from "./expressions/python.js"
import { evalJavascript } from "./expressions/javascript.js"
import { assertAction } from "./actions/assert.js"
import { handleResult } from "./actions/result.js"
import * as crypto from "node:crypto"
import { altAction } from "./actions/alt.js"
import chalk from "chalk"
import { conditionalsAction } from "./actions/conditionals.js"
import { traverseAction } from "./actions/traverse.js"
import { returnAction, setloopvarsAction, setstateAction, setvarsAction, sleepAction, workflowAction } from "./actions/actions.js"
import { coreWorkflows } from "./core/index.js"
import { createLocals } from "./utils.js"
import { loadConfig } from "./config.js"

const cm = chalk.magenta
const cy = chalk.yellow
const cr = chalk.red
const cg = chalk.green

const workflowsDir = "../examples/workflows"

const log = (str) => (x => {
  const myprint = (x) => {
    let output = ""
    if (R.is(Object, x)) {
      Object.entries(x).forEach(([key, value]) => {
        if (key === "state" || key === "workflows") {
          output += `${key} => ${Object.keys(value)} `
        } else {
          output += `${key} => ${myprint(value)} `
        }
        output += "\n"
      })
    }
    else if (R.is(Array, x)) {
      output += '[ '
      x.map(entry => output += `${myprint(entry)}, `)
      output += ' ]\n'
    }
    else if (R.is(String, x)) {
      output += x.substring(0, 20)
    }
    else {
      output += `${x}`

    }
    return output
  }
  console.log(`log [${str}] ${x.inspect ? x.inspect() : myprint(x)}`)
  return x
})

const initState = (st, wfs) => ({
  ...st,
  workflows: wfs,
  wstate: {},
  aborted: false,
  config: {}

  // workflow specific -- removed now
})

export const execute = (workflowName, opts = {}) => {
  return loadWorkflows(opts.workflowsPath || workflowsDir, { ignoreErrors: false })
    .chain(wfs => {
      if (opts.workflowYaml) {
        return loadWorkflows(null, { workflowYaml: opts.workflowYaml, ...opts })
          .chain(R.mergeRight(wfs))
      }
      else {
        return Box.Ok(wfs)
      }
    })
    .chain(wfs => Box.modifyState((st) => initState(st, wfs), wfs))
    .chain(() => loadConfig(opts.configFile))
    .chain(config => Box.modifyState(st => ({
      ...st,
      config
    }), config))
    .chain(() => executeWorkflow(workflowName, {}, 1))
}

export const executeWorkflow = (workflowName, args = {}, level = 1) => {
  if (workflowName.startsWith("core.")) return coreWorkflows(workflowName, args, level)
  let locals = createLocals(workflowName, level)
  locals.vars = { ...args }
  let traversals = {}
  let state = null

  const clearWorkflowState = (res) => {
    delete locals.vars
    locals.workflowName = ""
    return res
  }

  console.log(`${locals.l2s()}DEBUG: ${cy("Workflow")} Start for ${cm(workflowName)}`)

  return Box.getState()
    .map(_state => { state = _state; return undefined })
    .chain(() => {
      if (locals.workflowName && state.workflows[locals.workflowName]) {
        return execActions(state.workflows[locals.workflowName].actions, state, locals, traversals)
        /*
        let box = Box.Ok()
        state.workflows[locals.workflowName].actions.map((action) => {
          box = box.bimap(ret => setAction(ret, action), ret => setAction(ret, action))
          if (locals.ended === false && state.aborted === false && action.alt) box = box.alt((value) => altAction(value, state, locals))
          else box = box.chain(() => executeAction(state, locals))
          box = box.bimap(ret => clearAction(ret), ret => clearAction(ret))
        })
        return box.map(() => state)
        */
      }
      return Box.Err(`ERROR: the workflow ${locals.workflowName} does not exist`)
    })
    .chain(() => handleResult(state, locals, traversals))  // TODO handle cleanup for errors
    .bimap(ret => {
      console.log(`${locals.l2s()}DEBUG: ${cy("Workflow")} End (${cr("Err")}) for ${locals.workflowName} Err:${cr(ret)}`)
      return clearWorkflowState(ret)
    }, ret => {
      console.log(`${locals.l2s()}DEBUG: ${cy("Workflow")} End (${cg("Ok")}) for ${locals.workflowName}`)
      return clearWorkflowState(ret)
    })
}

export const execActions = (actions, state, locals, traversals) => {
  const setAction = (ret, action) => {
    locals.action = action
    return ret
  }

  const clearAction = (ret) => {
    delete locals.action
    return ret
  }

  let box = Box.Ok()
  let returnValue = null
  actions.map((action) => {
    box = box.bimap(ret => setAction(ret, action), ret => setAction(ret, action))
    if (locals.ended === false && state.aborted === false && action.alt) {
      box = box.alt((value) => altAction(value, state, locals, traversals))
    }
    else {
      box = box
        .chain(() => executeAction(state, locals, traversals))
        .map(ret => {
          if (action.return && R.is(Object, ret) && ret.hasOwnProperty(locals.retSymbol)) returnValue = ret[locals.retSymbol]
          return ret
        })
    }
    box = box.bimap(ret => clearAction(ret), ret => clearAction(ret))
  })
  return box.map((ret) => returnValue === null ? `action ok - ${ret}` : returnValue)
}

export const getActionType = (action) => {
  if (action.setvars) return "setvars"
  else if (action.setstate) return "setstate"
  else if (action.workflow) return "workflow"
  else if (action.error) return "error"
  else if (action.end) return "end"
  else if (action.abort) return "abort"
  else if (action.alt) return "alt"
  else if (action.sleep) return "sleep"
  else if (action.traverse) return "traverse"
  else if (action.python) return "python"
  else if (action.js) return "js"
  else if (action.conditionals) return "conditionals"
  else if (action.assert) return "assert"
  else if (action.return) return "return"
  else if (action.setloopvars) return "setloopvars"
  return "unknown"
}

export const executeAction = (state, locals, traversals) => {
  let action = locals.action

  if (locals.ended || state.aborted) return Box(x => x)

  console.log(`${locals.l2s(2)}DEBUG: Action <${cy(getActionType(action))}> Start for ${cm(locals.workflowName)}->${cm(action.name)}`)

  const actionEnd = (ret, err) => {
    console.log(`${locals.l2s(2)}DEBUG: Action <${cy(getActionType(action))}> End <${err ? cr("Err") : cg("Ok")}> ` +
      `for ${cm(locals.workflowName)}->${cm(action.name)} Vars:${cm(JSON.stringify({ ...locals.vars, ...traversals }))}`)
    return ret
  }

  if (action.setvars) {
    return setvarsAction(state, locals, traversals)
      .bimap(ret => actionEnd(ret, true), ret => actionEnd(ret, false))
  }
  else if (action.setstate) {
    return setstateAction(state, locals, traversals)
      .bimap(ret => actionEnd(ret, true), ret => actionEnd(ret, false))
  }
  else if (action.setloopvars) {
    return setloopvarsAction(state, locals, traversals)
      .bimap(ret => actionEnd(ret, true), ret => actionEnd(ret, false))
  }
  else if (action.return) {
    return returnAction(state, locals, traversals)
      .bimap(ret => actionEnd(ret, true), ret => actionEnd(ret, false))
  }
  else if (action.sleep) {
    return sleepAction(state, locals, traversals)
      .bimap(ret => actionEnd(ret, true), ret => actionEnd(ret, false))
  }
  else if (action.conditionals) {
    return conditionalsAction(state, locals, traversals)
      .bimap(ret => actionEnd(ret, true), ret => actionEnd(ret, false))
  }
  else if (action.traverse) {
    return traverseAction(state, locals, traversals)
      .bimap(ret => actionEnd(ret, true), ret => actionEnd(ret, false))
  }
  else if (action.workflow) {
    return workflowAction(state, locals, traversals)
      .bimap(ret => actionEnd(ret, true), ret => actionEnd(ret, false))
  }
  else if (action.assert) {
    return assertAction(state, locals, traversals)
      .bimap(ret => actionEnd(ret, true), ret => actionEnd(ret, false))
  }
  return Box.Err(`Workflow ${locals.workflowName} - no other action type supported as of now (${Object.keys(action)})`)
    .bimap(ret => actionEnd(ret, true), ret => actionEnd(ret, false))
}

export const execExpression = (key, value, state, locals, traversals) => {
  let workflowName = locals.workflowName
  let action = locals.action
  let act = ""
  if (R.is(String, value)) {
    if (value.startsWith("$jinja:")) {
      act = "jinja"
      value = { $jinja: value.slice("$jinja:".length) }
    }
    else if (value.startsWith("$jq:")) {
      act = "jq"
      value = { $jq: value.slice("$jq:".length) }
    }
    else if (value.startsWith("$js:")) {
      act = "js"
      value = { $js: value.slice("$js:".length) }
    }
    else if (value.startsWith("$python:")) {
      act = "python"
      value = { $python: value.slice("$python:".length) }
    }
    else {
      act = "jinja"
    }
  }
  else if (R.is(Object, value) && value.$jinja) act = "jinja"
  else if (R.is(Object, value) && value.$jq) act = "jq"
  else if (R.is(Object, value) && value.$python) act = "python"
  else if (R.is(Object, value) && value.$js) act = "js"

  return act === "jinja"
    ? evalJinja(key, value, state, locals, traversals)
    : act === "jq"
      ? evalJq(key, value, state, locals, traversals)
      : act === "python"
        ? evalPython(key, value, state, locals, traversals)
        : act === "js"
          ? evalJavascript(key, value, state, locals, traversals)
          : Box.Ok(value)
  // : Box.Err(`Unknown act ${act} for workflowName ${workflowName}, key is ${key}, value is ${JSON.stringify(value)}`)
}
