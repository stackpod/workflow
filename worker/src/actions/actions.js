import { Box } from "@stackpod/box"
import * as R from "ramda"
import { execExpression, executeWorkflow, identifyExpression, getActionType } from "../execute.js"
import chalk from "chalk"
import { dblog } from "../utils.js"

const cm = chalk.magenta
const cy = chalk.yellow
const cr = chalk.red
const cg = chalk.green

export const setvarsAction = (state, locals, traversals) => {
  let action = locals.action
  let box = Box.Ok()
  Object.entries(action.setvars).map(([key, value]) => {
    box = box.chain(() =>
      execExpression(key, value, state, locals, traversals)
        .map(ret => {
          locals.vars[key] = ret
          return ret
        })
    )
  })
  return box
}

export const setstateAction = (state, locals, traversals) => {
  let action = locals.action
  let box = Box.Ok()
  Object.entries(action.setstate).map(([key, value]) => {
    box = box.chain(() =>
      execExpression(key, value, state, locals, traversals)
        .map(ret => {
          state.wstate[key] = ret
          return ret
        })
    )
  })
  return box
}

export const setloopvarsAction = (state, locals, traversals) => {
  let action = locals.action
  let box = Box.Ok()
  Object.entries(action.setloopvars).map(([key, value]) => {
    box = box.chain(() =>
      execExpression(key, value, state, locals, traversals)
        .map(ret => {
          traversals[key] = ret
          return ret
        })
    )
  })
  return box
}

export const returnAction = (state, locals, traversals) => {
  let action = locals.action
  let box = Box.Ok()
  Object.entries({ return: action.return }).map(([key, value]) => {
    box = box.chain(() => execExpression(key, value, state, locals, traversals))
  })
  return box.map(ret => ({
    [locals.retSymbol]: ret
  }))
}

export const abortAction = (state, locals, traversals) => {
  let action = locals.action
  state.aborted = true
  locals.aborted = true
  dblog(locals, `${locals.l2s(2)}DEBUG: Action (${cy(getActionType(action))}) User Aborted execution for ${cm(locals.workflowName)}->${cm(action.name)} ${cr(action.abort)}`)

  return Box.Err(action.abort || "User Aborted")
}

export const errorAction = (state, locals, traversals) => {
  let action = locals.action
  let box = Box.Ok()
  let { act } = identifyExpression(action.error)
  if (typeof action.error === "object" && act === "none") {
    let obj = {}
    Object.entries({ error: action.error }).map(([key, value]) => {
      box = box.chain(() => {
        let v = execExpression(key, value, state, locals, traversals)
        obj[key] = v
      })
    })
    box = box.map(() => obj)
  }
  else {
    box = box.chain(() => execExpression("action.error", action.error, state, locals, traversals))
  }
  return box.chain(ret => {
    dblog(locals, `${locals.l2s(2)}DEBUG: Action (${cy(getActionType(action))}) User Error action for ${cm(locals.workflowName)}->${cm(action.name)} ${cr(JSON.stringify(ret))}`)
    return Box.Err(ret)
  })
}

export const loggerAction = (state, locals, traversals) => {
  let action = locals.action
  let box = Box.Ok()
  box = box.chain(() => execExpression("null", action.logger, state, locals, traversals))
  return box.map(ret => {
    dblog(locals, `${locals.l2s(2)}${cy("LOGGER:")} for "${cm(locals.workflowName)}->${cm(action.name)}" --> ${cy(JSON.stringify(ret))}`)
    return ret
  })
}

export const sleepAction = (state, locals, traversals) => {
  let action = locals.action
  return execExpression("sleep", action.sleep, state, locals, traversals)
    .chain(delay => {
      if (R.is(String, delay)) delay = parseInt(delay)
      if (R.is(Number, delay)) return Box.delay(delay * 1000, delay)
      else return Box.Err(`Invalid input to action sleep, ${action.sleep}`)
    })
}

export const constructArgs = (params, state, locals, traversals) => {
  let args = {}
  let box = Box.Ok(args)
    .chain(args => Box.modifyState(() => state, args))

  const handleObject = (key, val, args, idx = null) => {
    if (R.is(Object, val) && !R.is(Array, val)) {
      if (key && key.startsWith("__")) {
        args[key.slice(2)] = val
        return
      }
      if (key) {
        let { act } = identifyExpression(val)
        if (act != "none") {
          box = box.chain(() => execExpression(key, val, state, locals, traversals).map(_v => {
            args[key] = _v
            return args
          }))
        }
        else {
          if (!args[key]) args[key] = {}
          Object.entries(val).map(([k, v]) => handleObject(k, v, args[key]))
        }
      }
      else {
        if (!args[idx]) args[idx] = {}
        Object.entries(val).map(([k, v]) => handleObject(k, v, args[idx]))

      }
    }
    else if (R.is(Array, val)) {
      if (key) {
        args[key] = []
        val.forEach((v, _idx) => handleObject(null, v, args[key], _idx))
        return
      }
      else {
        args[idx] = []
        val.forEach((v, _idx) => handleObject(null, v, args[idx], _idx))
        return
      }
    }
    else if (R.is(String, val) && val.startsWith("__") && val.endsWith("__")) {
      if (key) {
        args[key] = val.slice(2, -2)
      }
      else {
        args[idx] = val.slice(2, -2)
      }
    }
    else {
      if (key) {
        box = box.chain(() => execExpression(key, val, state, locals, traversals).map(_v => {
          args[key] = _v
          return args
        }))
      }
      else {
        args[idx] = val
      }
    }
  }

  if (R.is(Object, params)) {
    Object.entries(params).map(([key, val]) => handleObject(key, val, args))
  }
  return box.map(() => args)
}
export const constructArgs1 = (params, state, locals, traversals) => {
  let args = {}
  let box = Box.Ok(args)
    .chain(args => Box.modifyState(() => state, args))

  const handleObject = (key, val, args) => {
    if (R.is(Object, val)) {
      let { act } = identifyExpression(val)
      if (act != "none") {
        box = box.chain(() => execExpression(key, val, state, locals, traversals).map(_v => {
          args[key] = _v
          return args
        }))
      }
      else {
        if (!args[key]) args[key] = {}
        Object.entries(val).map(([k, v]) => handleObject(k, v, args[key]))
      }
    }
    else {
      box = box.chain(() => execExpression(key, val, state, locals, traversals).map(_v => {
        args[key] = _v
        return args
      }))
    }
  }

  if (R.is(Object, params)) {
    Object.entries(params).map(([key, val]) => handleObject(key, val, args))
  }
  return box.map(() => args)
}

export const workflowAction = (state, locals, traversals) => {
  let action = locals.action
  console.log("executeWorkflow", action.args)
  let box = constructArgs(action.args, state, locals, traversals)
  return box.chain(args => executeWorkflow(action.workflow, locals.execId, args, locals.level + 1))
    .map(ret => {
      let store = action.store || "result"
      locals.vars[store] = ret
      return ret
    })
}
