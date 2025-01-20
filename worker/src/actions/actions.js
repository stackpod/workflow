import { Box } from "@stackpod/box"
import * as R from "ramda"
import { execExpression, executeWorkflow } from "../execute.js"
import chalk from "chalk"

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

export const loggerAction = (state, locals, traversals) => {
  let action = locals.action
  let box = Box.Ok()
  Object.entries({ logger: action.logger }).map(([key, value]) => {
    box = box.chain(() => execExpression(key, value, state, locals, traversals))
  })
  return box.map(ret => {
    console.log(`${locals.l2s(2)}${cy("LOGGER:")} for "${cm(locals.workflowName)}->${cm(action.name)}" --> ${ret}`)
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

  const handleObject = (key, val, args) => {
    if (R.is(Object, val)) {
      if (!args[key]) args[key] = {}
      Object.entries(val).map(([k, v]) => handleObject(k, v, args[key]))
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
  let box = constructArgs(action.args, state, locals, traversals)
  return box.chain(args => executeWorkflow(action.workflow, args, locals.level + 1))
    .map(ret => {
      let store = action.store || "result"
      locals.vars[store] = ret
      return ret
    })
}
