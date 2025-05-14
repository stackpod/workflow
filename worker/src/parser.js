import { statSync, readFileSync, existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { Box } from "@stackpod/box"
import * as R from "ramda"
import Ajv2020 from "ajv/dist/2020.js"
import yaml from "js-yaml"
import path from "node:path"
import { getWorkflows, envConfig } from "./lib/dbindex.js"

export const isDir = (pathname) => {
  let lstat = statSync(pathname)
  return lstat ? lstat.isDirectory() : false
}

/**
 * Walks a path recursively (and safely) and returns the filenames (with full paths)
 * which is filtered by the reg exp
 *
 * pathname: string that points to the file / dir
 * opts:
 *   recursive: <boolean>, default false (Will recursively check for any depth)
 *   filterFileNames: <string> a regexp, default null (Get only interesting files ex: ".(yaml|yml)$")
 *   ignoreErrors: <boolean>, default true (If any file/dir is not readable, should be ignored or not)
 *
 * Returns a list of files with full paths
 */

export const walkFiles = (pathname, opts = {}) => {
  const parseEntries = (f) => {
    let fname = join(f.path, f.name)
    let st = statSync(fname)
    return f.isFile()
      ? Box.Ok(fname)
      : (opts.recursive && (f.isDirectory() || (f.isSymbolicLink() && st.isDirectory())))
        ? walkFiles(fname)
        : (f.isSymbolicLink() && st.isFile())
          ? Box.Ok(fname)
          : Box.Ok(null)

  }
  return Box.of(pathname)
    .map(async (p) => await readdir(p, { withFileTypes: true }))
    .traverse(parseEntries, opts.ignoreErrors !== false ? Box.TraverseAllOk : Box.TraverseAll, Box.TraverseParallel)
    .map(R.flatten)
    .map(R.filter(R.isNotNil))
    .map(R.filter(f => opts.filterFileNames ? f.match(opts.filterFileNames) : true))
}

/*
 * Box loadWorkflows(pathname)
 *
 * Loads one file or multiple files in a directory and returns an
 * array of yaml parsed objects
 *
 * pathname: string that points to the file / dir
 * opts:
 *   ignoreErrors: <boolean>, default true (If any file/dir is not readable / parseable, should be ignored or not)
 *   workflowYaml: <string> String containing Yaml defining workflows (instead of reading from files, and path should be null)
 */
export const loadWorkflows = (pathname, opts = {}) => {

  let schema
  const __dirname = path.dirname(new URL(import.meta.url).pathname)
  const schemaFile = path.join(__dirname, "./lib/workflow_schema.yaml") // TODO - fix tha path
  const ajv2020 = new Ajv2020()

  try {
    schema = yaml.load(readFileSync(schemaFile))
  } catch (err) {
    return Box.Err(`Unable to load schema file ${schemaFile}, ${err.message}`)
  }

  const parseYaml = (resp) => {
    try {
      resp.yaml = yaml.load(resp.contents)
    }
    catch (err) {
      return Box.Err(`Error parsing yaml in ${resp.filename}, ${err.message}`)
    }
    let validate = ajv2020.compile(schema)
    // console.log("file yaml", Object.keys(resp.yaml), resp.yaml)
    if (validate(resp.yaml)) return Box.Ok({ filename: resp.filename, yaml: resp.yaml })
    return Box.Err(`Error validating ${resp.filename}, ${JSON.stringify(validate.errors)}`)
  }

  const _readFile = async (file) => {
    return Box.Ok({ filename: file, contents: await readFile(file) })
  }

  const loadDbWorkflows = (yamls) => {
    return Box.Ok()
      .chain(async () => {
        if (!(envConfig?.elasticsearch?.url)) return Box.Ok({ yamls, dbyamls: [] })
        let ret = await getWorkflows()
        if (ret.status != "ok") return Box.Ok({ yamls, dbyamls: [] })
        let dbyamls = ret.workflows.map(wf => wf.workflow)
        return Box.Ok({ yamls, dbyamls })
      })
  }

  const mergeWorkflows = ({ yamls, dbyamls }) => {
    let wfs = {}
    let err = ""
    yamls.map(y => {
      y.yaml.workflows.map(w => {
        if (opts.ignoreErrors === false && wfs[w.name]) {
          err += `Workflow ${w.name} from ${y.filename} already present and is a duplicate\n`
        }
        wfs[w.name] = w
      })
    })
    dbyamls.map(w => {
      let validate = ajv2020.compile(schema)
      if (!validate({ workflows: [w] })) {
        err += `Error validating ${w?.name}, ${JSON.stringify(validate.errors)}`
        return
      }
      if (opts.ignoreErrors === false && wfs[w.name]) {
        // err += `Workflow ${w.name} from database already present and is a duplicate\n`
        console.log(`Workflow ${w.name} from database already present and is a duplicate. Ignoring it\n`)
        return
      }
      wfs[w.name] = w
    })
    if (err.length) return Box.Err(`Accumulated Errors - ${err}`)
    return Box.Ok(wfs)
  }

  if (pathname == null && opts.workflowYaml)
    return Box.Ok([{ filename: "inline", yaml: opts.workflowYaml }])
      .traverse(parseYaml, opts.ignoreErrors !== false ? Box.TraverseAllOk : Box.TraverseAll, Box.TraverseParallel)
      .chain(mergeWorkflows)

  return Box.Ok(pathname)
    .chain(p =>
      existsSync(p)
        ? isDir(p)
          ? walkFiles(p, { filterFileNames: ".(yaml|yml)$", recursive: true })
          : Box.Ok([p])
        : Box.Ok([])
    )
    .traverse(_readFile, opts.ignoreErrors !== false ? Box.TraverseAllOk : Box.TraverseAll, Box.TraverseParallel)
    .traverse(parseYaml, opts.ignoreErrors !== false ? Box.TraverseAllOk : Box.TraverseAll, Box.TraverseParallel)
    .chain(loadDbWorkflows)
    .chain(mergeWorkflows)
}

