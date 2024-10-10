import { Box } from "@stackpod/box"
import * as R from "ramda"
import { loadWorkflows } from "./parser.js"

import { evalJinja } from "./expressions/jinja.js"
import { evalJq } from "./expressions/jq.js"
import { evalPython } from "./expressions/python.js"
import { evalJavascript } from "./expressions/javascript.js"
import { assertEqualsAction, assertExprAction } from "./actions/assert.js"
import { handleResult } from "./actions/result.js"
import * as crypto from "node:crypto"
import { altAction } from "./actions/alt.js"

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
  workspaces: {},
  aborted: false,

  // workflow specific
  workspace: null,
  workspaceName: "",
  workflowName: "",
  ended: false,

  // stack of workflows
  stack: []
})

const initWorkspace = (workflowName) => {
  let workspaceName = workflowName + crypto.randomBytes(5).toString("hex")
  return workspaceName
}

export const execute = (workflowName, workflowYaml, opts = {}) => {
  return loadWorkflows(workflowsDir, { ignoreErrors: false })
    .chain(wfs => {
      if (workflowYaml) {
        return loadWorkflows(null, { workflowYaml, ...opts })
          .chain(R.mergeRight(wfs))
      }
      else {
        return Box.Ok(wfs)
      }
    })
    .chain(wfs => Box.modifyState((st) => initState(st, wfs), wfs))
    .chain(() => executeWorkflow(workflowName, {}))
}

export const executeWorkflow = (workflowName, args = {}) => {
  let workspaceName

  console.log(`DEBUG: Execute Workflow Start for ${workflowName}`)

  return Box.getState()
    .map(state => {
      // save current workflow
      if (state.workspaceName)
        state.stack.push({ workflowName: state.workflowName, workspaceName: state.workspaceName })
      workspaceName = initWorkspace(workflowName)
      state.workspaces[workspaceName] = { ...args }
      state.workspace = state.workspaces[workspaceName]
      state.workflowName = workflowName
      state.workspaceName = workspaceName
      return state
    })
    .chain(state => {
      if (state.workflows[workflowName]) {
        let box = Box.Ok()
        state.workflows[workflowName].actions.map((action) => {
          if (state.ended === false && state.aborted === false && action.alt) box = box.alt((value) => altAction(value, state, action))
          else box = box.chain(() => executeAction(action, state))
        })
        return box.map(() => state)
        /*
        return Box.Ok(state.workflows[workflowName].actions)
          .traverse(action => executeAction(action, state, workflowName), Box.TraverseAll, Box.TraverseSeries)
          .map(() => state)
        */
      }
      return Box.Err(`ERROR: the workflow ${workflowName} does not exist`)
    })
    .chain(state => handleResult(state))  // TODO handle cleanup for errors
    .chain(ret =>
      Box.getState()
        .map(state => {
          if (state.stack.length) {
            let stack = state.stack.pop()
            state.workflowName = stack.workflowName
            state.workspaceName = stack.workspaceName
            state.workspace = state.workspaces[stack.workspaceName]
          }
          return ret
        })
    )
    .bichain(ret => {
      console.log(`DEBUG: Execute Workflow End (Err) for ${workflowName}`)
      return Box.Err(ret)
    }, ret => {
      console.log(`DEBUG: Execute Workflow End (Ok) for ${workflowName}`)
      return Box.Ok(ret)
    })
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
  else if (action.assert) return "assert"
  return "unknown"
}

export const executeAction = (action, state) => {
  let workflowName = state.workflowName
  state.action = action
  console.log(`DEBUG: Execute Action (${getActionType(action)}) Start for ${workflowName}->${action.name}`)

  if (state.ended || state.aborted) return Box(x => x)

  if (action.setvars) {
    let box = Box.Ok()
    Object.entries(action.setvars).map(([key, value]) => {
      box = box.chain(() => setvarsAction(key, value, state))
    })
    return box.map(() => state)
    /*
    return Box.Ok(Object.entries(action.setvars))
      .traverse(([key, value]) => setvarsAction(key, value, state, workflowName, action), Box.TraverseAll, Box.TraverseSeries)
      .map(() => state)
    */
  }
  else if (action.setstate) {
    let box = Box.Ok()
    Object.entries(action.setstate).map(([key, value]) => {
      box = box.chain(() => setstateAction(key, value, state))
    })
    return box.map(() => state)
  }
  else if (action.workflow) {
    let args = {}
    let box = Box.Ok()
    if (R.is(Object, action.args)) {
      Object.entries(action.args).map(([key, value]) => {
        box = box.chain(() => execExpression(key, value, state).map(v => {
          args[key] = v
          return args
        }))
      })
    }
    return box.chain(args => executeWorkflow(action.workflow, args))
      .map(ret => {
        let store = action.store || "result"
        if (state.workspace) state.workspace[store] = ret
        return ret
      })
  }
  else if (action.assert) {
    let box = Box.Ok()
    Object.entries(action.assert).map(([key, value]) => {
      if (key === "$expressions" && R.is(Array, value)) {
        value.map(val => {
          box = box.bichain(
            (err) => assertExprAction("$expressions", val, state, err),
            () => assertExprAction("$expressions", val, state)
          )
        })
      } else {
        box = box.bichain(
          (err) => assertEqualsAction(key, value, state, err),
          () => assertEqualsAction(key, value, state)
        )

      }
    })
    return box.map(() => state)
  }
  return Box.Err(`Workflow ${workflowName} - no other action type supported as of now (${Object.keys(action)})`)
}

export const execExpression = (key, value, state) => {
  let workflowName = state.workflowName
  let action = state.action
  let act = ""
  if (R.is(String, value) || (R.is(Object, value) && value.$jinja)) act = "jinja"
  else if (R.is(Object, value) && value.$jq) act = "jq"
  else if (R.is(Object, value) && value.$python) act = "python"
  else if (R.is(Object, value) && value.$js) act = "javascript"

  return act === "jinja"
    ? evalJinja(key, value, state, workflowName, action)
    : act === "jq"
      ? evalJq(key, value, state, workflowName, action)
      : act === "python"
        ? evalPython(key, value, state, workflowName, action)
        : act === "js"
          ? evalJavascript(key, value, state, workflowName, action)
          : Box.Ok(value)
  // : Box.Err(`Unknown act ${act} for workflowName ${workflowName}, key is ${key}, value is ${JSON.stringify(value)}`)
}

export const setvarsAction = (key, value, state) => {
  return execExpression(key, value, state)
    .map(ret => {
      state.workspace[key] = ret
      return state
    })
}

export const setstateAction = (key, value, state) => {
  return execExpression(key, value, state)
    .map(ret => {
      state.wstate[key] = ret
      return state
    })
}

export const workflowAction = (key, value, state, workflowName, action) => {

}

