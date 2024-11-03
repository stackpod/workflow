import { Box } from "@stackpod/box"
import * as R from "ramda"
import { execActions, execExpression, execute } from "../execute.js"
import chalk from "chalk"
import { tryCatch } from "../utils.js"

const cm = chalk.magenta
const cy = chalk.yellow
const cr = chalk.red
const cg = chalk.green

export const traverseAction = (state, locals, traversals) => {
  let workflowName = locals.workflowName
  let action = locals.action

  const logresult = (err) => (res) => {
    console.log(`${locals.l2s(4)}DEBUG Traverse Workflow:${cm(workflowName)} Action:${cm(action?.name || "noname")} Result:${err ? cr(res) : cy(JSON.stringify(res))}`, res)
    return res
  }

  const clearVarName = async (ret) => {
    // if (!(locals?.vars)) return
    let varName = action.traverse.varName || "item"
    delete locals.vars[varName]
    if (action.traverse.indexName) delete locals.vars[action.traverse.indexName]
    return ret
  }

  const determineMode = () => {
    if (action.traverse.loopCheck == "All") return Box.TraverseAll
    else if (action.traverse.loopCheck == "Any") return Box.TraverseAny
    else if (action.traverse.loopCheck == "Race") return Box.TraverseRace
    else if (action.traverse.loopCheck == "AllOk") return Box.TraverseAllOk
    else return Box.TraverseAll
  }

  let shouldExit = false

  const loopFn = (items) =>
    Box.Ok(items)
      .chain((loop) => execExpression("loop", loop, state, locals, traversals))
      .traverse(
        async (item, index) => {
          let varName = action.traverse.varName || "item"
          let tvls = { ...traversals }
          tvls[varName] = item
          if (action.traverse.indexName) tvls[action.traverse.indexName] = index
          return shouldExit
            ? Box.Ok(item)
            : execActions(action.traverse.actions, state, locals, tvls)
              .chain((x) =>
                shouldExit
                  ? Box(x)
                  : action.traverse.exitConditional
                    ? execExpression("exitConditional", action.traverse.exitConditional, state, locals, tvls)
                      .map(ret => {
                        if (ret) shouldExit = true
                        return ret
                      })
                    : Box(x)
              )
          // .bimap(logresult(true), logresult(false))
          // .bimap(clearVarName, clearVarName)
        },
        determineMode(),
        action.traverse.parallel === true
          ? Box.TraverseParallel
          : R.is(Number, action.traverse.parallel)
            ? action.traverse.parallel
            : Box.TraverseSeries
      )

  if (action.traverse.loop === true) {
    if (action.traverse.parallel === true) {
      return Box.Err(`ERROR in traverse configuration, both loop and parallel cannot be boolean true Workflow:${cm(workflowName)} Action:${cm(action?.name)}`)
    }
    let items = R.is(Number, action.traverse.parallel) ? R.range(0, action.traverse.parallel - 1) : [1]
    let cnt = 0
    let start = Date.now()
    while (true) {
      let box = loopFn(items)
      if (shouldExit || Box.isErr(box)) return box
      if (cnt > 1000) {
        if (Date.now() - start < 10000) return Box.Err(`ERROR: Too fast while loop execution. Number of executions cnt} since ${start}`)
        cnt = 0
        start = Date.now()
      }
    }
  }
  else {
    return loopFn(action.traverse.loop || action.traverse.array)
      .map(ret => {
        if (action.store) {
          locals.vars[action.store] = ret
        }
        return ret
      })
  }
}

