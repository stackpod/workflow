import { Box } from "@stackpod/box"
import { execExpression } from "../execute.js"
import { matchValue } from "../utils.js"

export const assertEqualsAction = (key, value, state, err) => {
  if (err) {
    if (key === "$error") {
      if (err == value) return Box.Ok(true)
      else return Box.Err(`ERROR: Assert failure, ${key} Expected value: ${value} Actual value: ${err}`)
    }
    return Box.Err(err)
  }
  else {
    if (state.workspace[key] == value) return Box.Ok(true)
    else return Box.Err(`ERROR: Assert failure, ${key} Expected value: ${value} Actual value: ${state.workspace[key]}`)
  }
}

export const assertExprAction = (key, value, state, err) => {
  if (err)
    state.workspace["$error"] = err

  const evalTrue = (ret) => ret === "true" || ret === true ? true : false

  const errFn = (ret) => {
    if (evalTrue(ret)) return Box.Ok(ret)
    else return Box.Err(`ERROR: Assert failure on error, Error:${err} Expr:${value} Expected value:true  Evaled value:${ret}`)
  }
  const okFn = (ret) => {
    console.log(`assert okFn -${ret}-`, ret, typeof (ret), evalTrue(ret))
    if (evalTrue(ret)) return Box.Ok(ret)
    else return Box.Err(`ERROR: Assert failure, Key:${key} Expr:${value} Expected value:true  Evaled value:${ret}`)
  }
  return execExpression(key, value, state)
    .bichain(errFn, okFn)
    .alt(ret => evalTrue(ret) ? Box.Ok(ret) : Box.Err(ret))
}
