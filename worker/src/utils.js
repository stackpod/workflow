import child_process from "child_process"
import { Box } from "@stackpod/box"
import * as R from "ramda"
import { readFileSync, writeFileSync } from "node:fs"
import chalk from "chalk"

export const matchValue = (expected, actual) => {
  if (R.is(String, actual) && R.is(String, expected)) {
    if (expected.startsWith("/") && expected.endsWith("/")) {
      try {
        const regex = new RegExp(expected)
        return regex.test(actual)
      }
      catch (err) {
        return err.message
      }
    }
  }
  return "Invalid or unimplemented types of expected/actual provided"
}

export const spawn = (cmd, args, options) => {
  return new Promise((resolve, reject) => {
    try {
      const input = options.input
      let sp = child_process.spawn(cmd, args, R.omit(["input"], options))
      const writeInput = () => {
        if (input) {
          sp.stdin.cork()
          sp.stdin.write(input)
          sp.stdin.end()
        }
      }
      sp.stdin.on("error", () => { }) // ignoring stdin EPIPE error, if jq crashes for some reason
      sp.on("spawn", () => writeInput("spawn"))
      sp.on("open", () => writeInput("open"))
      let out = []
      let err = []
      sp.stdout.on("data", (data) => out.push(data))
      sp.stderr.on("data", (data) => err.push(data))
      sp.on("close", (code) => {
        resolve({ stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString(), code })
      })
      sp.on("error", (err) => reject(err))
    } catch (e) {
      reject(e)
    }
  })
}

// safeSpawn :: String -> Array String -> Object -> Box String State
export const safeSpawn = (cmd, args, options) => Box.fromPromiseLazy(() => spawn(cmd, args, options))()

export const safeJsonParse = (str) => {
  try {
    return Box(JSON.parse(str))
  }
  catch (err) {
    return Box.Err(err.message)
  }
}

export const tryCatch = (tryFn, catchFn) => (x, y) => {
  try {
    return tryFn(x, y)
  } catch (e) {
    return catchFn(e.message)
  }
}

/*
 * fetched: front-end to fetch
 * Params:
 * request:
 *   url: url
 *   method: <method> | default GET
 *   headers: <object> | default {}
 *   body: <string|object|array> | default None 
 *   json: <string|object|array> | default None 
 *   from: <string|object> | default None 
 *   readFile: <string> default None
 *   redirect: <"follow"|"error"|"manual"> default "follow"
 * response:
 *   json: <boolean> | default false
 *   text: <boolean> | default false
 *   writeToFile: <string>
 *   errorCodes: <array> | default ["4xx", "5xx"]
*/


export const fetched = (args = {}) => {
  return new Promise((resolve, reject) => {
    let url = args.request.url
    let method = args.request.method || "GET"
    let headers = args.request.headers || { "user-agent": "stackpod.io/workflow" }
    let redirect = args.request.redirect
    if (!args?.response) args.response = {}

    let body
    if (args.request.body) {
      if (R.is(Object, args.request.body) || R.is(Array, args.request.body)) {
        body = JSON.stringify(args.request.body)
        headers["content-type"] = "application/json"
      }
      else body = args.request.body
    }
    else if (args.request.json) {
      body = JSON.stringify(args.request.json)
      headers["content-type"] = "application/json"
    }
    else if (args.request.form) {
      if (R.is(Object, args.request.form)) {
        let data = R.is(Object, args.request.form)
          ? Object.entries(args.request.form).map(([k, v]) => `${k}=${v}`).join("&")
          : ""
        if (method == "GET") url = url + "?" + data
        else body = data
        headers["content-type"] = "application/x-www-form-urlencoded"
      }
      else return reject(`ERROR: fetch: "form" should be of type Object`)
    }
    else if (args.request.readFile) {
      try {
        body = readFileSync(args.request.readFile)
      }
      catch (err) {
        return reject(err)
      }
    }

    const req = new Request(url, {
      method,
      body,
      headers,
      redirect,
      signal: args.request.timeout ? AbortSignal.timeout(args.request.timeout) : undefined
    })

    fetch(req)
      .then(resp => {
        resp.bytes()
          .then(data => {
            let buf = Buffer.from(data)
            let ret
            try {
              if (args.response.writeToFile) {
                writeFileSync(args.response.writeToFile, data)
              }
              else if (args.response.json) {
                ret = JSON.parse(buf.toString())
              }
              else if (args.response.text) {
                ret = buf.toString()
              }
            }
            catch (err) {
              return reject(new Error(`ERROR: fetch had errors while parsing response`, { cause: err }))
            }

            return resolve({
              statusCode: resp.status,
              statusText: resp.statusText,
              headers: resp.headers,
              ok: resp.ok,
              url: resp.url,
              raw: buf,
              body: ret
            })
          })
      })
      .catch(err => reject(new Error("ERROR: fetched failed", { cause: err })))
  })
}

// safeFetched :: Object -> Box Object State
export const safeFetched = (args) => Box.fromPromiseLazy(() => fetched(args))()

/*
 * ErrorToString
 * Converts Error to String
 *
 */
// ErrorToString :: Error() -> String
export const ErrorToString = (error, stack = false) => {
  if (!(error instanceof Error)) return error

  let stacks = []
  const getStacks = (err) => {
    if (err.stack) stacks.push(err.stack.split("\n").slice(1))
    if (err.cause) getStacks(err.cause)
  }
  const updateStacks = (err) => {
    if (err.stack) err.stack2 = stacks.shift().join("\n")
    if (err.cause) updateStacks(err.cause)
  }
  const deleteStacks = (err) => {
    if (err.stack2) delete err.stack2
    if (err.cause) deleteStacks(err.cause)
  }
  const getKV = (err) => {
    let ret = ""
    Object.entries(err).map(([k, v]) => {
      if (k === "stack2") return
      ret += (ret.length ? ", " : "") + `${k} = ${v}`
    })
    return ret
  }

  getStacks(error)
  for (let i = 0; i < stacks.length; i++) {
    for (let j = i + 1; j < stacks.length; j++) {
      stacks[i] = stacks[i].filter(line => stacks[j].includes(line) ? false : true)
    }
  }
  updateStacks(error)

  let kv = getKV(error)
  let ret = `${error.name}: ${error.message}` +
    `${stack ? ("\n" + error.stack2) : ""}` +
    `${kv.length ? ((stack ? "\n" : "  ") + getKV(error)) : ""}` +
    `${error.cause ? ((stack ? "\n[cause] " : ", [cause] ") + ErrorToString(error.cause, stack)) : ""}`

  deleteStacks(error)
  return ret
}

let runningId = 0
export const createLocals = (workflowName, level = 1) => {
  runningId += 1
  const f = (id) => (spaces = 0) => {
    let d = new Date().toISOString()
    return R.range(0, (level == 1 ? 2 : ((level - 1) * 4 + 2)) + spaces).map(() => " ").join("") +
      chalk.cyan(`id:${id} ${chalk.blue(d)} `)
  }
  return {
    vars: {},
    workflowName,
    level,
    id: runningId,
    l2s: f(runningId),
    ended: false
  }
}
