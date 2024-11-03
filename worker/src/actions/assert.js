import { Box } from "@stackpod/box"
import * as R from "ramda"
import { execExpression } from "../execute.js"
import { matchValue } from "../utils.js"

export const assertAction = (state, locals, traversals) => {
  let action = locals.action
  let box = Box.Ok()

  // if any assert failure happens, we do not try any other expression
  let assertFailure = false
  const assertEqualsAction = (key, value, state, locals, traversals, err) => {
    if (assertFailure) return Box.Err(err)
    if (err) {
      if (key === "$error") {
        if (err == value) return Box.Ok(true)
        else {
          assertFailure = true
          return Box.Err(`ERROR: Assert failure, ${key} Expected value: ${value} Actual value: ${err}`)
        }
      }
      return Box.Err(err)
    }
    else {
      if (locals.vars[key] == value) return Box.Ok(true)
      else {
        assertFailure = true
        return Box.Err(`ERROR: Assert failure, ${key} Expected value: ${value} Actual value: ${locals.vars[key]}`)
      }
    }
  }

  const assertExprAction = (key, value, state, locals, traversals, err) => {
    if (assertFailure) return Box.Err(err)
    if (err)
      locals["$error"] = err

    const evalTrue = (ret) => ret === "true" || ret === true ? true : false

    const errFn = (ret) => {
      if (evalTrue(ret)) return Box.Ok(ret)
      else {
        assertFailure = true
        return Box.Err(`ERROR: Assert failure on error, Error:${err} Expr:${value} Expected value:true  Evaled value:${ret}`)
      }
    }
    const okFn = (ret) => {
      if (evalTrue(ret)) return Box.Ok(ret)
      else {
        assertFailure = true
        return Box.Err(`ERROR: Assert failure, Key:${key} Expr:${value} Expected value:true  Evaled value:${ret}`)
      }
    }
    return execExpression(key, value, state, locals, traversals)
      .bichain(errFn, okFn)
    // .alt(ret => evalTrue(ret) ? Box.Ok(ret) : Box.Err(ret))
  }


  Object.entries(action.assert).map(([key, value]) => {
    if (key === "$expressions" && R.is(Array, value)) {
      value.map(val => {
        box = box.bichain(
          (err) => assertExprAction("$expressions", val, state, locals, traversals, err),
          () => assertExprAction("$expressions", val, state, locals, traversals)
        )
      })
    } else {
      box = box.bichain(
        (err) => assertEqualsAction(key, value, state, locals, traversals, err),
        () => assertEqualsAction(key, value, state, locals, traversals)
      )
    }
  })
  return box
}

