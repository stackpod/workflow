import { Box } from "@stackpod/box"
import * as R from "ramda"
import { execExpression, executeWorkflow } from "../execute.js"

export const setvarsAction = (state, locals, traversals) => {
  let action = locals.action
  let box = Box.Ok()
  Object.entries(action.setvars).map(([key, value]) => {
    box = box.chain(() =>
      execExpression(key, value, state, locals, traversals)
        .map(ret => {
          locals.vars[key] = ret
          return state
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
          return state
        })
    )
  })
  return box
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

export const workflowAction = (state, locals, traversals) => {
  let action = locals.action
  let args = {}
  let box = Box.Ok()
  if (R.is(Object, action.args)) {
    Object.entries(action.args).map(([key, value]) => {
      box = box.chain(() => execExpression(key, value, state, locals, traversals).map(v => {
        args[key] = v
        return args
      }))
    })
  }
  return box.chain(args => executeWorkflow(action.workflow, args, locals.level + 1))
    .map(ret => {
      let store = action.store || "result"
      locals.vars[store] = ret
      return ret
    })
}
