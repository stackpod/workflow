const setv = (vars: string | undefined, def: string | number | boolean | undefined | null = undefined) => {
  if (vars === undefined) return def
  if (vars.toLowerCase() === "true") return true
  if (vars.toLowerCase() === "false") return false
  if (vars.toLowerCase() === "null") return null
  if (vars.toLowerCase() === "undefined") return undefined
  return vars
}

export const envConfig: Record<string, any> = {
  elasticsearch: {
    url: setv(process.env.ELASTICSEARCH_URL),
    auth: {
      username: setv(process.env.ELASTICSEARCH_USERNAME),
      password: setv(process.env.ELASTICSEARCH_PASSWORD),
    },
    tls: {
      cacert: setv(process.env.ELASTICSEARCH_CACERT),
      rejectUnAuthorized: setv(process.env.ELASTICSEARCH_TLS_REJECT_UNAUTHORIZED, true),
    },
    logsIndexSuffix: setv(process.env.ELASTICSEARCH_LOGS_SUFFIX, "weekly"),
    workflowsIndex: setv(process.env.ELASTICSEARCH_INDEX_WORKFLOWS, "workflows"),
    logsIndex: setv(process.env.ELASTICSEARCH_INDEX_LOGS, "workflowlogs"),
  },

  engineUrl: setv(process.env.ENGINE_URL, undefined)
}
