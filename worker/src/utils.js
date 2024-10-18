import child_process from "child_process"
import { Box } from "@stackpod/box"
import * as R from "ramda"

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


