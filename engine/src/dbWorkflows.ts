import { readFileSync } from "node:fs"
import { Client } from "@elastic/elasticsearch"
import { envConfig } from "./envconfig"
import { deleteRecord, esConnect, getAllRecords, getRecord, insert } from "./elasticsearch"
import Ajv2020 from "ajv/dist/2020.js"
import path from "node:path"
// @ts-ignore
import yaml from "js-yaml"


const WORKFLOW_INDEX = "workflows"

var esclient: Client


const validateWorkflow = (workflow: Record<string, any>) => {
  let schema
  const __dirname = path.dirname(new URL(import.meta.url).pathname)
  const schemaFile = path.join(__dirname, "./workflow_schema.yaml")
  const ajv2020 = new Ajv2020()

  schema = yaml.load(readFileSync(schemaFile))
  let validate = ajv2020.compile(schema)
  let workflows = { workflows: [workflow] }
  if (validate(workflows)) return true
  return `Error validating ${JSON.stringify(workflows)}, ${JSON.stringify(validate.errors)}`
}

export const insertOrUpdateWorkflow = async (workflowId: string, workflow: Record<string, any>) => {

  let val = validateWorkflow(workflow)
  if (val !== true) return { status: "error", error: val }

  try {
    if (!esclient) esclient = esConnect(envConfig)
    let ret = await getRecord(esclient, envConfig.elasticsearch.workflowsIndex, workflowId)
    let doc


    if (ret) {
      doc = {
        ...ret,
        lastModified: new Date(),
        workflow: JSON.stringify(workflow)
      }
    }
    else {
      doc = {
        id: workflowId,
        createdAt: new Date(),
        lastModified: new Date(),
        workflow: JSON.stringify(workflow)
      }
    }
    ret = await insert(esclient, envConfig.elasticsearch.workflowsIndex, workflowId, doc, { refresh: true })
    return { status: "ok", workflowId: workflowId }
  }
  catch (err: unknown) {
    return { status: "error", error: (<Error>err).message, stack: (<Error>err).stack }
  }
}

export const insertYamlWorkflows = async (body: string) => {

  try {
    var obj: Record<string, any> = yaml.load(body)
  }
  catch (err: unknown) {
    return { status: "error", error: (<Error>err).message, stack: (<Error>err).stack }
  }
  let workflows: Array<Record<string, any>> = obj.workflows

  for (let i in workflows) {
    let wf = workflows[i]
    // @ts-ignore
    let ret = await insertOrUpdateWorkflow(wf.name, wf)
    if (ret.status == "error") return ret
  }
  return { status: "ok" }

}

export const getWorkflow = async (workflowId: string) => {
  try {
    if (!esclient) esclient = esConnect(envConfig)
    let ret = await getRecord(esclient, envConfig.elasticsearch.workflowsIndex, workflowId)

    if (!ret) return { status: "error", error: "Not found" }
    return {
      status: "ok", workflow: {
        workflowId: workflowId,
        createdAt: ret.createdAt,
        lastModified: ret.lastModified,
        workflow: JSON.parse(ret.workflow)
      }
    }
  }
  catch (err: unknown) {
    return { status: "error", error: (<Error>err).message, stack: (<Error>err).stack }
  }
}

export const getWorkflows = async () => {
  try {
    if (!esclient) esclient = esConnect(envConfig)
    let ret = await getAllRecords(esclient, envConfig.elasticsearch.workflowsIndex, { match_all: {} })
    return {
      status: "ok",
      workflows: (Array.isArray(ret) ? ret : []).map(rec => ({
        workflowId: rec.id,
        createdAt: rec.createdAt,
        lastModified: rec.lastModified,
        workflow: JSON.parse(rec.workflow)
      }))
    }
  }
  catch (err: unknown) {
    return { status: "error", error: (<Error>err).message, stack: (<Error>err).stack }
  }
}

export const deleteWorkflow = async (workflowId: string) => {
  try {
    if (!esclient) esclient = esConnect(envConfig)
    let ret = await getRecord(esclient, envConfig.elasticsearch.workflowsIndex, workflowId)

    if (!ret) return { status: "error", error: "Not found" }
    ret = await deleteRecord(esclient, envConfig.elasticsearch.workflowsIndex, workflowId)
    return { status: "ok", workflow: { workflowId: workflowId, } }
  }
  catch (err: unknown) {
    return { status: "error", error: (<Error>err).message, stack: (<Error>err).stack }
  }
}
