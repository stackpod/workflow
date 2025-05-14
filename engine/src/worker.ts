import { getWorkflowStatuses } from "./dbLogs"
import { getWorkflows } from "./dbWorkflows"

const workerList: Record<string, any> = {}

export const registerWorker = (worker: string, args: Record<string, any>) => {

  if (!workerList[worker]) workerList[worker] = {}

  workerList[worker] = { ...workerList[worker], ...args }

  let wlw = workerList[worker]
  if (wlw.url && wlw.name && worker === wlw.name) {
    wlw.status = wlw.status || "ok"
    wlw.lastModified = new Date()
    return { status: "ok" }
  }
  else {
    delete workerList[worker]
    return { status: "error", error: `Worker ${worker} does not contain url and name params properlty` }
  }
}

export const getWorkerList = () => {
  return {
    status: "ok",
    workers: Object.keys(workerList).map(w => workerList[w])
  }
}

const checkWorker = () => {

  Object.keys(workerList).forEach(w => {
    fetch(workerList[w].url + "/worker/healthcheck")
      // @ts-ignore
      .then(resp => resp.bytes())
      .then(data => {
        let d = JSON.parse(Buffer.from(data).toString())
        if (d.status === "ok" && d.worker === w) {
          workerList[w].status = "ok"
          workerList[w].lastModified = new Date()
        }
        else {
          workerList[w].error = `Invalid data received from worker ${w} data: ${Buffer.from(data).toString()}`
          workerList[w].status = "error"
          workerList[w].lastModified = new Date()
          console.log(workerList[w].error)
        }
      })
      .catch(err => {
        workerList[w].error = `Exception caught during healthcheck:  ${w} error: ${err.message} stack: ${err.stack} url:${workerList[w].url}`
        workerList[w].status = "error"
        workerList[w].lastModified = new Date()
        console.log(workerList[w].error)
      })
  })
}

export const getAllExecIds = async () => {
  let execIds = {}
  let allIds = await Promise.allSettled(Object.keys(workerList).map(w => fetch(workerList[w].url + "/worker/workflow/exec/running").then(resp => resp.json())))
  allIds.forEach(ret => {
    if (ret.status == "fulfilled") execIds = { ...execIds, ...ret.value.running }
    else console.log("Worker running returned", ret)
  })
  return execIds
}

export const setupCheckWorker = () => {
  setTimeout(checkWorker, 100)
  setInterval(checkWorker, 10000)
}

export const startWorkflowExec = async (workflowId: string, args: Record<string, any>, asynch: string | undefined) => {

  let workers = Object.keys(workerList).filter(worker => workerList[worker].status === "ok")
  if (workers.length === 0) {
    return {
      status: "error",
      error: `No worker available Total workers:${Object.keys(workerList).length} 
              List of workers:${Object.keys(workerList).join(",")} Active workers:0`
    }
  }
  let worker = workers[0]
  try {
    // for now, always send it to the first worker
    let resp = await fetch(new Request(workerList[worker].url + `/worker/workflow/exec/run/${workflowId}?asynch=${asynch || "no"}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args)
      }))
    // @ts-ignore
    let data = await resp.bytes()
    let j = JSON.parse(Buffer.from(data).toString())
    return j

  }
  catch (err) {
    return { status: "error", error: `Unable to send/received workflow exec request to the worker ${worker}, err:${err}` }
  }
}

export const startStartupWorkflows = async () => {

  let startupWorkflowIds = []
  try {
    let ret: Record<string, any> = await getWorkflows()
    if (ret.status != "ok") {
      return console.log(`Unable to get startup workflows`, ret)
    }

    startupWorkflowIds = ret.workflows
      .map((w: Record<string, any>) => w.workflowId)
      .filter((w: string) => w.startsWith("startup."))
    console.log("startStartupWorkflows: startupWorkflowIds=", startupWorkflowIds)

  }
  catch (err) {
    return console.log(`Unable to get startup workflows`, err)
  }

  if (startupWorkflowIds.length === 0) return

  let runningWorkflows: Record<string, any>[] = []
  let notRunningStartupWorkflowIds = []
  try {

    let ret: Record<string, any> = await getWorkflowStatuses({ start: undefined, end: undefined, workflowId: undefined, limit: 200, status: "running" })
    if (ret.status != "ok") {
      return console.log(`Unable to get running workflows`, ret)
    }

    runningWorkflows = ret.executions.filter((e: Record<string, any>) => e.status === "running")

    notRunningStartupWorkflowIds = startupWorkflowIds
      .filter((wf: string) => runningWorkflows.filter((rf: Record<string, any>) => wf === rf.workflowId).length === 0)
  }
  catch (err) {
    console.log(`Unable to get running workflows`, err)
    return
  }

  try {
    console.log("Not running startup Workflow Ids, starting them now", notRunningStartupWorkflowIds)

    let runret = await Promise.all(notRunningStartupWorkflowIds.map((wf: string) => startWorkflowExec(wf, {}, "true")))
    console.log(`Run status of startup Workflows`, runret)
  }
  catch (err) {
    console.log(`Unable to startup workflows`, err)
    return
  }
}

export const setupStartupWorkflows = () => {
  setTimeout(startStartupWorkflows, 4000)
  setInterval(startStartupWorkflows, 60000)
}
