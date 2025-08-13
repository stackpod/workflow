import child_process from "child_process"
import { Box } from "@stackpod/box"
import * as R from "ramda"
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, appendFileSync } from "node:fs"
import chalk from "chalk"
import { default as crocks } from "crocks"
import { format } from "node:util"
import { addWorkflowLogs, endWorkflowExec, envConfig } from "./lib/dbindex.js"
import path from "node:path"
const { isFunction } = crocks
import { configCache } from "./config.js"


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
      dispatcher: args.request.dispatcher,
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
              return reject(new Error(`ERROR: fetch had errors while parsing response` + JSON.stringify({
                statusCode: resp.status,
                statusText: resp.statusText,
                url: resp.url,
                body: buf.toString(),
                headers: resp.headers,
              }), { cause: err }))
            }

            if (resp.status > 299) {
              if (!args.response.acceptAllHTTPStatusCodes) {
                return reject(new Error(`ERROR: Status code is not 200`, {
                  cause: JSON.stringify({
                    statusCode: resp.status,
                    statusText: resp.statusText,
                    headers: resp.headers,
                    url: resp.url,
                    raw: buf,
                    body: ret
                  })
                }))
              }
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
let retSymbol = Symbol("return")
export const createLocals = (workflowName, execId, level = 1) => {
  runningId += 1
  const f = (id) => (spaces = 0) => {
    let d = new Date().toISOString()
    return R.range(0, (level == 1 ? 2 : ((level - 1) * 4 + 2)) + spaces).map(() => " ").join("") +
      chalk.cyan(`id:${id} ${execId} ${chalk.blue(d)} `)
  }
  return {
    vars: {},
    execId,
    workflowName,
    level,
    id: runningId,
    l2s: f(runningId),
    ended: false,
    retSymbol,
  }
}

let timeoutIds = {}

export const sleep = (timeout, setCancel) => {
  const clearTimeoutId = (id) => {
    clearTimeout(id)
    delete timeoutIds[id]
  }
  return new Promise((resolve) => {
    let id = setTimeout(() => {
      clearTimeoutId(id)
      resolve()
    }, timeout)
    timeoutIds[id] = 1
    if (isFunction(setCancel)) {
      setCancel(() => clearTimeoutId(id))
    }
  })
}

export const cancelAllSleeps = () => {
  Object.keys(timeoutIds).map(clearTimeout)
  timeoutIds = []
}

export const getExecId = (src, workflowName) => {
  let dt = new Date()
  const f2d = new Intl.NumberFormat("en", { minimumIntegerDigits: 2 }).format
  const f3d = new Intl.NumberFormat("en", { minimumIntegerDigits: 3 }).format
  return global.workerName + "_" + format("%d", dt.getFullYear()) + f2d(dt.getMonth() + 1) + f2d(dt.getDate()) +
    "T" + f2d(dt.getHours()) + f2d(dt.getMinutes()) + f2d(dt.getSeconds()) +
    f3d(dt.getMilliseconds()) +
    "_" + src + "_" + workflowName
}

const pdblogs = {}

var dbi = 1
// Lets fire and forget
export const dblog = (locals, log) => {
  console.log(log)
  if (!envConfig?.elasticsearch?.url) return

  if (!pdblogs[locals.execId]) pdblogs[locals.execId] = { logs: [], inp: false }
  pdblogs[locals.execId].logs.push(log)

  const removeOne = (eid) => {
    if (pdblogs[eid]) {
      pdblogs[eid].logs.shift()
      pdblogs[eid].inp = false
      if (pdblogs[eid].logs.length === 0) {
        setTimeout(() => {
          if (pdblogs[eid]) {
            if (!pdblogs[eid].logs) delete pdblogs[eid]
            else if (pdblogs[eid].logs.length === 0) delete pdblogs[eid]
          }
        }, 1000)
      }
    }
  }

  const _dblog = (_idx) => {
    let eids = Object.keys(pdblogs)
    if (eids.length === 0) return

    for (let i in eids) {
      let eid = eids[i]
      if (pdblogs[eid].inp) continue
      if (pdblogs[eid].logs.length === 0) continue
      pdblogs[eid].inp = true
      let _log = pdblogs[eid].logs[0]
      addWorkflowLogs(eid, _log)
        .then(ret => {
          if (ret.status == "error")
            console.log("FAILED to addWorkflowLogs", ret)
          removeOne(eid)
          _dblog(dbi)
        })
        .catch(err => {
          console.log(`${_idx} ${locals.execId} Unable to push log line into Database ${log}, Error:${err.message} ${err.stack}`)
          removeOne(eid)
          _dblog(dbi)
        })
    }
  }
  _dblog(dbi)
}

// for end, we need to wait until there is no pending logs
export const endWorkflow = async (execId, status, result, error) => {
  if (!envConfig?.elasticsearch?.url) return

  let st = new Date()
  while (true) {
    if (!pdblogs[execId]) break
    if (new Date() - st > 10000) break
    await sleep(10)
  }

  let ret = await endWorkflowExec(execId, status, result, error, st)
}

class CircularLogger {
  constructor({ numFiles = 5, maxSizeBytes = 1024 * 1024 * 1024, logDir = './logs', baseFilename = 'log' }) {
    this.numFiles = numFiles;
    this.maxSizeBytes = maxSizeBytes;
    this.logDir = logDir;
    this.baseFilename = baseFilename;
    this.stateFile = path.join(this.logDir, '.logstate.json');
    this.currentFileIndex = 1;

    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }

    this._loadState();
  }

  _getFilePath(index) {
    return path.join(this.logDir, `${this.baseFilename}${index}.txt`);
  }

  _loadState() {
    try {
      const state = JSON.parse(readFileSync(this.stateFile, 'utf8'));
      if (state.currentFileIndex >= 1 && state.currentFileIndex <= this.numFiles) {
        this.currentFileIndex = state.currentFileIndex;
      }
    } catch (err) {
      // No state file or corrupted – will initialize fresh
      this._saveState();
    }
  }

  _saveState() {
    writeFileSync(this.stateFile, JSON.stringify({ currentFileIndex: this.currentFileIndex }));
  }

  log(msg) {
    const filePath = this._getFilePath(this.currentFileIndex);
    const logLine = `[${new Date().toISOString()}] ${msg}\n`;

    let currentSize = 0;
    try {
      currentSize = statSync(filePath).size;
    } catch (e) {
      // File may not exist yet
    }

    if (currentSize + Buffer.byteLength(logLine) > this.maxSizeBytes) {
      // Switch to next file (with wraparound)
      this.currentFileIndex = (this.currentFileIndex % this.numFiles) + 1;
      const newFilePath = this._getFilePath(this.currentFileIndex);
      writeFileSync(newFilePath, logLine);  // Overwrite new file
    } else {
      appendFileSync(filePath, logLine);
    }

    this._saveState();
  }
}

var conciseCfg = {}
var defaultConciseCfg = {
  1: { maxKeys: 10, maxLength: 50 },
  2: { maxKeys: 5, maxLength: 20 },
  3: { maxKeys: 2, maxLength: 20 },
}
function getConciseConfig() {

  let config = configCache

  if (config?.logging?.level != "concise") return null
  if (conciseCfg == null) return defaultConciseCfg
  if (Object.keys(conciseCfg).length) return conciseCfg


  if (!config?.logging?.concise || !Array.isArray(config.logging.concise)) return defaultConciseCfg

  let cfg = {}
  config.logging.concise.map((c, idx) => {
    let level = c.depthLevel ? c.depthLevel : idx + 1
    cfg[level] = { maxKeys: c.maxKeys || 0, maxLength: c.maxLength || 0 }
  })
  let levels = Object.keys(cfg).map(l => parseInt(l))
  let maxLevel = Math.max(...levels)
  let minLevel = Math.min(...levels)
  let levelsSet = new Set(levels)

  if (levelsSet.size != levels.length) {
    console.log(`config.logging.concise - Logging configuration issue, contains incorrect depth levels. Ignoring concise logging config`)
    conciseCfg = null
    return defaultConciseCfg
  }
  if (minLevel != 1) {
    console.log(`config.logging.concise - Logging configuration issue, starting depth level is not 1. Ignoring concise logging config`)
    conciseCfg = null
    return defaultConciseCfg
  }

  if (maxLevel != levels.length) {
    console.log(`config.logging.concise - Logging configuration issue, missing depth levels ${maxLevel} vs ${levels.length}. Ignoring concise logging config`)
    conciseCfg = null
    return defaultConciseCfg
  }

  conciseCfg = cfg
  return conciseCfg
}

export function rstrip(str, delim) {
  const regex = new RegExp(`[${delim}]+$`, 'g')
  return str.replace(regex, "")
}

// conciseStringify 
export function conciseStringify(obj, {
  depth = 1,
  key = null,
  visited = new WeakSet()
} = {}) {

  let cfg = getConciseConfig()
  if (cfg == null) return "..."

  let maxKeys = cfg[depth].maxKeys
  let maxLength = cfg[depth].maxLength
  if (key == '$error') maxLength = 500

  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return obj.length > maxLength ? rstrip(JSON.stringify(obj.slice(0, maxLength)), '"') + '..."' : JSON.stringify(obj);
    }
    return JSON.stringify(obj);
  }

  if (visited.has(obj)) {
    return '"[Circular]"';
  }
  visited.add(obj);

  if (Array.isArray(obj)) {
    const items = obj.slice(0, maxKeys).map(item =>
      conciseStringify(item, { depth: depth + 1, visited })
    );
    if (obj.length > maxKeys) items.push('"..."');
    return `[${items.join(', ')}]`;
  }

  if (depth >= Object.keys(cfg).length) return '"[Object]"';

  const keys = Object.keys(obj).slice(0, maxKeys);
  const keyVals = keys.map(k => {
    try {
      return `${JSON.stringify(k)}: ${conciseStringify(obj[k], { depth: depth + 1, visited, key: k })}`;
    } catch {
      return `${JSON.stringify(k)}: "[Error]"`;
    }
  });

  if (Object.keys(obj).length > maxKeys) keyVals.push('"..."');

  return `{ ${keyVals.join(', ')} }`;
}

