import { statSync, readFileSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { Box } from "@stackpod/box"
import * as R from "ramda"
import yaml from "js-yaml"
import path from "node:path"
import Ajv2020 from "ajv/dist/2020.js"

export var configCache = null

export const loadConfig = (filename, opts = {}) => {

  opts.ignoreErrors = false
  let schema
  const __dirname = path.dirname(new URL(import.meta.url).pathname)
  const schemaFile = path.join(__dirname, "./lib/config_schema.yaml")
  const defaultConfig = path.join(__dirname, "./lib/default_config.yaml")
  const ajv2020 = new Ajv2020()

  try {
    schema = yaml.load(readFileSync(schemaFile))
  } catch (err) {
    return Box.Err(`Unable to load config schema file ${schemaFile}, ${err.message}`)
  }

  const parseYaml = (resp) => {
    try {
      resp.yaml = yaml.load(resp.contents)
    }
    catch (err) {
      return Box.Err(`Error parsing config yaml in ${resp.filename}, ${err.message}`)
    }
    let validate = ajv2020.compile(schema)
    if (validate(resp.yaml)) return Box.Ok({ filename: resp.filename, yaml: resp.yaml })
    return Box.Err(`Error validating config ${resp.filename}, ${JSON.stringify(validate.errors)}`)
  }

  const _readFile = async (file) => {
    return Box.Ok({ filename: file, contents: await readFile(file) })
  }

  const mergeConfigs = (yamls) => {
    let config = {}
    yamls.map(y => {
      config = R.mergeRight(config, y.yaml)
    })
    return Box.Ok(config)
  }

  const configs = [{ filename: defaultConfig }]
  if (filename) configs.push({ filename })

  return Box.Ok(configs)
    .traverse(async cfg => await _readFile(cfg.filename), opts.ignoreErrors !== false ? Box.TraverseAllOk : Box.TraverseAll, Box.TraverseParallel)
    .traverse(parseYaml, opts.ignoreErrors !== false ? Box.TraverseAllOk : Box.TraverseAll, Box.TraverseParallel)
    .chain(mergeConfigs)
    .map(cfg => {
      configCache = cfg
      return cfg
    })
}


