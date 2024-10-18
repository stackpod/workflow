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

  return Box.Ok(action.traverse.array)
    .chain((loop) => execExpression("array", loop, state, locals, traversals))
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
}

