import { Client } from "@elastic/elasticsearch"
import { envConfig } from "./envconfig"
import { esConnect, getAllRecords, insert, searchIdRecord2 } from "./elasticsearch"
import { getAllExecIds } from "./worker"

var esclient: Client

const WORKFLOW_LOGS_INDEX = "workflowlogs"

const getWeek = (dt: Date) => {
  var st = new Date(dt.getFullYear(), 0, 1)
  // @ts-ignore
  return Math.ceil((((dt - st) / 86400000) + st.getDay() + 1) / 7)
}

const getLogIndex = (dt: Date) => {
  if (envConfig.elasticsearch.logsIndexSuffix == "weekly") {
    return envConfig.elasticsearch.logsIndex + "-" + dt.getFullYear() + "-" + getWeek(dt)
  }
  return envConfig.elasticsearch.logsIndex + "-" + dt.getFullYear() + "-" + dt.getMonth()
}

export const startWorkflowExec = async (workflowId: string, execId: string, args: Record<string, any>, datetime: Date) => {

  if (!esclient) esclient = esConnect(envConfig)
  let ret
  let doc = {
    id: execId,
    execId: execId,
    workflowId: workflowId,
    startedAt: datetime,
    status: "running",
    lastModified: new Date(),
    args: JSON.stringify(args),
    logs: JSON.stringify([]),
    result: JSON.stringify(""),
    error: JSON.stringify(""),
    executionTime: 0
  }

  try {
    ret = await insert(esclient, getLogIndex(datetime), execId, doc, { refresh: true })
    return { status: "ok", execId: execId, workflowId, _id: ret._id }
  }
  catch (err: unknown) {
    return { status: "error", error: (<Error>err).message, stack: (<Error>err).stack }
  }
}

export const endWorkflowExec = async (execId: string, status: any, result: any, error: any, endTime: any) => {
  if (!esclient) esclient = esConnect(envConfig)
  let ret = await searchIdRecord2(esclient, envConfig.elasticsearch.logsIndex + "-*", execId)
  if (!ret) return { status: "error", error: `endWorkflowExec: Unable to get record for execId:${execId} status:${status} result:${result} error:${error}` }

  let doc = {
    ...ret._source,
    lastModified: endTime,
    status,
    result: JSON.stringify(result || ""),
    // @ts-ignore
    executionTime: endTime - new Date(ret._source.startedAt),
    error: JSON.stringify(error || "")
  }

  try {
    ret = await insert(esclient, ret._index, execId, doc, { refresh: true })
    return { status: "ok", execId: execId, _id: ret._id }
  }
  catch (err: unknown) {
    return { status: "error", error: (<Error>err).message, stack: (<Error>err).stack }
  }
}

export const addWorkflowLogs = async (execId: string, log: Record<string, any>) => {

  if (!esclient) esclient = esConnect(envConfig)
  let ret = await searchIdRecord2(esclient, envConfig.elasticsearch.logsIndex + "-*", execId)
  if (!ret) return { status: "error", error: `addWorkflowLogs: Unable to get record for execId:${execId}, log=${log}` }

  let logs = JSON.parse(ret._source.logs)
  logs.push(log)
  let doc = {
    ...ret._source,
    lastModified: new Date(),
    logs: JSON.stringify(logs)
  }

  try {
    ret = await insert(esclient, ret._index, execId, doc, { refresh: true })
    return { status: "ok", execId: execId, _id: ret._id }
  }
  catch (err: unknown) {
    return { status: "error", error: (<Error>err).message, stack: (<Error>err).stack }
  }
}

export const getWorkflowStatus = async (execId: string, logs: string | undefined, colors: string | undefined) => {
  if (!esclient) esclient = esConnect(envConfig)
  let ret = await searchIdRecord2(esclient, envConfig.elasticsearch.logsIndex + "-*", execId)
  if (!ret) return { status: "error", error: `No execId ${execId} present` }

  let s = ret._source

  const removeAnsiColors = (logs: string[]) => {
    return logs.map(x => x.replaceAll(/\x1b\[.../g, ""))
  }
  if (logs === undefined || logs === null || logs === "") logs = "yes"
  if (colors === undefined || colors === null || colors === "") colors = "no"
  const isStringTrue = (s: string) => (s.toLowerCase() === "no" || s.toLowerCase() === "false" || s === "0" || s.length === 0 || s === undefined || s === null) ? false : true

  var execIds = {}
  try {
    execIds = await getAllExecIds()
  }
  catch (err) { }

  return {
    status: "ok",
    execution: {
      execId: s.execId,
      workflowId: s.workflowId,
      args: JSON.parse(s.args),
      // @ts-ignore
      status: s.status == "running" ? execIds[s.execId] ? "running" : "unknown" : s.status,
      startedAt: s.startedAt,
      lastModified: s.lastModified,
      executionTime: s.executionTime,
      error: JSON.parse(s.error),
      result: JSON.parse(s.result),
      logs: isStringTrue(logs)
        ? isStringTrue(colors)
          ? JSON.parse(s.logs)
          : removeAnsiColors(JSON.parse(s.logs))
        : []
    }
  }
}

export const getWorkflowStatuses = async ({ start, end, workflowId, status, limit = 200 }: { start: Date | undefined, end: String | undefined, workflowId: string | undefined, status: string | undefined, limit: number | undefined }) => {
  if (!esclient) esclient = esConnect(envConfig)
  if (!(workflowId || start || end)) status = status || "running"
  let queries = []
  let q1: Record<string, any> = {}
  if (start && end)
    q1 = { range: { startedAt: { gte: start, lte: end } } }
  else if (start)
    q1 = { range: { startedAt: { gte: start, } } }
  else if (end) q1 = { range: { startedAt: { lte: end } } }

  if (Object.keys(q1).length) queries.push(q1)
  if (workflowId) {
    queries.push({
      match: {
        workflowId
      }
    })
  }

  if (status) {
    queries.push({
      match: {
        status: status
      }
    })
  }

  let query = {
    bool: {
      must: queries
    }
  }
  try {
    var ret = await getAllRecords(esclient, envConfig.elasticsearch.logsIndex + "-*", query, limit)
  }
  catch (err: unknown) {
    console.log("queries", query, "err", err)
    return { status: "error", error: (<Error>err).message, stack: (<Error>err).stack }
  }

  var execIds = {}
  try {
    execIds = await getAllExecIds()
  }
  catch (err) { }

  if (status == "running") {
    // @ts-ignore
    ret = ret.filter(s => s.status == "running" ? execIds[s.execId] ? true : false : true)
  }

  return {
    status: "ok",
    // @ts-ignore
    executions: ret.map(s => ({
      execId: s.execId,
      workflowId: s.workflowId,
      args: JSON.parse(s.args),
      // @ts-ignore
      status: s.status == "running" ? execIds[s.execId] ? "running" : "unknown" : s.status,
      startedAt: s.startedAt,
      lastModified: s.lastModified,
      executionTime: s.executionTime,
      error: JSON.parse(s.error),
      result: JSON.parse(s.result),
    }))
  }
}
