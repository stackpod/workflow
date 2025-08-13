import { Elysia, t } from "elysia"
import { swagger } from "@elysiajs/swagger"
import { insertOrUpdateWorkflow, getWorkflow, getWorkflows, deleteWorkflow, insertYamlWorkflows } from "./dbWorkflows";
import { getWorkflowStatus, getWorkflowStatuses } from "./dbLogs";
import { registerWorker, setupCheckWorker, setupStartupWorkflows, startWorkflowExec, getWorkerList, cancelWorkflowExec } from "./worker";

setupCheckWorker()
setupStartupWorkflows()

export const DateTime = t.Union([
  t.String({ format: "date-time", example: "2025-02-11T12:00:00.0Z", default: undefined }),
  t.String({ format: "date-time", example: "2025-02-11T12:00:00", default: undefined }),
  t.String({ format: "date", example: "2025-02-11", default: undefined }),
])

const app = new Elysia({ normalize: true })
  .use(swagger({
    documentation: {
      info: {
        title: "Workflow Engine Documentation",
        version: "0.25.0"
      },
      tags: [
        { name: "Exec", description: "Workflow Execution APIs" },
        { name: "Workflow", description: "APIs for Creating / Updating Workflows" },
        { name: "Admin", description: "APIs for administering engine" },
        { name: "Worker", description: "APIs for workers to register/healthcheck" },
      ]
    }

  }))
  // ------------------------ Exec API type
  .post("/workflow/exec/run/:workflowId",
    async ({ body: { args }, params: { workflowId }, query: { asynch } }) => {
      console.log("engine run workflow", args, workflowId, asynch, "body", args)
      return await startWorkflowExec(workflowId, args, asynch)
    },
    {
      params: t.Object({
        workflowId: t.String(),
      }),
      query: t.Object({
        asynch: t.Optional(t.String({
          description: `Should the workflow execution be asynchronously done? If true, the 
          response will be sent immediately. The user needs to call the /workflow/exec/status/:execId subsequently 
          to check the status. If false, the default, the API will only send the response after the completion of the workflow`
        }))

      }),
      body: t.Object({
        args: t.Object({}, { additionalProperties: true })
      }, {
        description: "Variables as key-value pairs to be passed to Workflow for execution",
        additionalProperties: true
      }),
      detail: {
        summary: "Run the workflow",
        description: "Use this endpoint to run the workflow in any of the worker (decided by the engine). Pass the workflowId and the arguments as key value pairs",
        tags: ["Exec"]
      },
      response: t.Object({
        status: t.String(),
        execId: t.Optional(t.String()),
        error: t.Optional(
          t.Union([
            t.String(),
            t.Object({}, { additionalProperties: true })
          ])),
        result: t.Optional(
          t.Union([
            t.String(),
            t.Object({}, { additionalProperties: true })
          ]))
      })
    })
  .get("/workflow/exec/status",
    async ({ query: { workflowId, status, start, end, limit }, }) => {
      return await getWorkflowStatuses({ start, workflowId, status, end, limit })
    },
    {
      query: t.Object({
        start: t.Optional(t.Date()),
        workflowId: t.Optional(t.String()),
        status: t.Optional(t.String()),
        end: t.Optional(DateTime),
        limit: t.Optional(t.Number({ description: "Max number of records to return, default is 200" })),
      }),
      detail: {
        summary: "List of workflow executions",
        description: "Get a list of workflow executions that is running right now, or in the past. For past, specify a start/end timespec",
        tags: ["Exec"]
      },
      response: t.Object({
        status: t.String(),
        error: t.Optional(t.String()),
        executions: t.Optional(t.Array(
          t.Object({
            execId: t.String(),
            workflowId: t.String(),
            args: t.Union([
              t.String(),
              t.Object({}, { additionalProperties: true })
            ]),
            status: t.String(),
            startedAt: t.Date(),
            lastModified: t.Date(),
            executionTime: t.Number(),
            error: t.Optional(
              t.Union([
                t.String(),
                t.Object({}, { additionalProperties: true })
              ])),
            result: t.Optional(
              t.Union([
                t.String(),
                t.Object({}, { additionalProperties: true })
              ]))
          })
        ))
      })

    })
  .get("/workflow/exec/status/:execId",
    async ({ params: { execId }, query: { logs, colors }, }) => {
      return getWorkflowStatus(execId, logs, colors)
    },
    {
      params: t.Object({
        execId: t.String(),
      }),
      query: t.Optional(
        t.Object({
          logs: t.Optional(t.String({ default: "yes" })),
          colors: t.Optional(t.String({ default: "no" })),
        })
      ),
      detail: {
        summary: "Get details of a workflow execution",
        description: "Get all the details of a specific workflow execution by the execId",
        tags: ["Exec"]
      },
      response: t.Object({
        status: t.String(),
        error: t.Optional(t.String()),
        execution: t.Optional(
          t.Object({
            execId: t.String(),
            workflowId: t.String(),
            args: t.Union([
              t.String(),
              t.Object({}, { additionalProperties: true })
            ]),
            status: t.String(),
            startedAt: t.Date(),
            lastModified: t.Date(),
            executionTime: t.Date(),
            error: t.Optional(
              t.Union([
                t.String(),
                t.Object({}, { additionalProperties: true })
              ])),
            result: t.Optional(
              t.Union([
                t.String(),
                t.Object({}, { additionalProperties: true })
              ])),
            logs: t.Union([t.String(), t.Array(t.String())])
          })
        )
      })

    })
  .put("/workflow/exec/cancel/:execId",
    async ({ params: { execId } }) => {
      return await cancelWorkflowExec(execId)
    },
    {
      params: t.Object({
        execId: t.String(),
      }),
      detail: {
        summary: "Cancel a workflow execution",
        description: "Use this endpoint to cancel (stop) a running workflow. Throws error if the workflow is already not running",
        tags: ["Exec"]
      },
      response: t.Object({
        status: t.String(),
        message: t.Optional(t.String()),
        error: t.Optional(t.String()),
      })

    })
  // ------------------------ Workflows API type
  .post("/workflow/bulk/workflows/yaml",
    async ({ body, }) => {
      return await insertYamlWorkflows(body)
    },
    {
      body: t.String({ description: "Workflow yaml file as text" }),
      detail: {
        summary: "Create / Update directly multiple workflows from a YAML file",
        description: "Use this endpoint to create / update multiple workflows from a YAML file. Just send the YAML as body text",
        tags: ["Workflow"]
      },
      response: t.Object({
        status: t.String(),
        error: t.Optional(t.String()),
        workflows: t.Optional(t.Array(
          t.Object({
            workflowId: t.String(),
          })
        ))
      })
    })

  .post("/workflow/workflows/:workflowId",
    async ({ body: { workflow }, params: { workflowId }, }) => {
      return await insertOrUpdateWorkflow(workflowId, workflow)
    },
    {
      params: t.Object({
        workflowId: t.String(),
      }),
      body: t.Object({
        workflow: t.Object({}, { additionalProperties: true })
      }, {
        description: "Workflow object containing name and actions"
      }),
      detail: {
        summary: "Create / Update the workflow",
        description: "Use this endpoint to create / update the workflow specifications. Workflow is stored in the database",
        tags: ["Workflow"]
      },
      response: t.Object({
        status: t.String(),
        error: t.Optional(t.String()),
        workflowId: t.Optional(t.String())
      })
    })

  .get("/workflow/workflows/summary", () => ({ status: "ok", error: `` }),
    {
      detail: {
        summary: "List of workflows",
        description: "Get a list of all the workflows, only short details are provided",
        tags: ["Workflow"]
      },
      response: t.Object({
        status: t.String(),
        error: t.Optional(t.String()),
        workflows: t.Optional(t.Array(
          t.Object({
            workflowId: t.String(),
            name: t.String(),
            description: t.String(),
            lastModified: t.Date(),
          })
        ))
      })
    })

  .get("/workflow/workflows/:workflowId",
    async ({ params: { workflowId }, }) => {
      return await getWorkflow(workflowId)
    },
    // ({ status: "ok", error: `${workflowId}` }),
    {
      params: t.Object({
        workflowId: t.String(),
      }),
      detail: {
        summary: "Details of a workflow",
        description: "Get all the specifications of a workflow in a object format",
        tags: ["Workflow"]
      },
      response: t.Object({
        status: t.String(),
        error: t.Optional(t.String()),
        stack: t.Optional(t.String()),
        workflow: t.Optional(t.Object({
          workflowId: t.String(),
          createdAt: t.Date(),
          lastModified: t.Date(),
          workflow: t.Optional(t.Any())
        })
        )
      })
    })
  .get("/workflow/workflows",
    async () => {
      return await getWorkflows()
    },
    // ({ status: "ok", error: `` }),
    {
      detail: {
        summary: "List of workflows",
        description: "Get a list of all the workflows",
        tags: ["Workflow"]
      },
      response: t.Object({
        status: t.String(),
        error: t.Optional(t.String()),
        stack: t.Optional(t.String()),
        workflows: t.Optional(t.Array(
          t.Object({
            workflowId: t.String(),
            createdAt: t.Date(),
            lastModified: t.Date(),
            workflow: t.Optional(t.Any())
          })
        ))
      })
    })
  .delete("/workflow/workflows/:workflowId",
    async ({ params: { workflowId }, }) => {
      return await deleteWorkflow(workflowId)
    },
    // ({ status: "ok", error: `${workflowId}` }),
    {
      params: t.Object({
        workflowId: t.String(),
      }),
      detail: {
        summary: "Delete a workflow",
        description: "Delete a workflow from the database",
        tags: ["Workflow"]
      },
      response: t.Object({
        status: t.String(),
        error: t.Optional(t.String()),
        stack: t.Optional(t.String()),
        workflow: t.Optional(t.Object({
          workflowId: t.String(),
        })
        )
      })
    })
  // ------------------------ Admin API type
  .post("/config", ({ body: { config }, }) => ({ status: "ok", error: `${config}` }),
    {
      body: t.Object({
        config: t.Object({}, { additionalProperties: true })
      }, {
        description: "Workflow Configuration Object"
      }),
      detail: {
        summary: "Update the Configuration of Workflow Engine",
        description: "You can update the configuration of the workflow engine. The configuration is updated in the running instance as well as update in the database",
        tags: ["Admin"]
      },
      response: t.Object({
        status: t.String(),
        error: t.Optional(t.String()),
      })
    })
  .get("/worker/workers",
    () => getWorkerList(),
    {
      detail: {
        summary: "List of workers running",
        description: "Get a list of workers running",
        tags: ["Admin"]
      },
      response: t.Object({
        status: t.String(),
        error: t.Optional(t.String()),
        workers: t.Optional(t.Array(t.Object({
          name: t.String(),
          url: t.String(),
          status: t.String(),
          lastModified: t.Date()
        })))
      })
    })
  // ------------------------ Worker API type
  .post("/worker/registration",
    ({ body: { workerId, action, workerUrl }, }) => {
      return registerWorker(workerId, { action, url: workerUrl, name: workerId })
    },
    {
      body: t.Object({
        workerId: t.String(),
        action: t.Union([
          t.Literal("register"),
          t.Literal("unregister"),
          t.Literal("pause"),
          t.Literal("config"),
        ]),
        workerUrl: t.String()
      }, {
        description: "Registration endpoint for a worker node"
      }),
      detail: {
        summary: "Register a worker",
        description: "This endpoint is used to register / unregister a worker, by the worker itself. The worker can also pause itself or simply ask for a config update",
        tags: ["Worker"]
      },
      response: t.Object({
        status: t.String(),
        error: t.Optional(t.String()),
      })
    })
  .put("/worker/healthcheck", ({ body: { workerId }, }) => ({ status: "ok", error: `${workerId}` }),
    {
      body: t.Object({
        workerId: t.String(),
      }, {
        description: "Healthcheck endpoint for a worker node"
      }),
      detail: {
        summary: "Healthcheck from a worker",
        description: "This endpoint is used by the worker to update its healthcheck to the main engine",
        tags: ["Worker"]
      },
      response: t.Object({
        status: t.String(),
        error: t.Optional(t.String()),
      })
    })
  .listen(3000)

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
