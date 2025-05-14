import { Client, HttpConnection } from "@elastic/elasticsearch"

const range = (start: number, end: number, step = 1) => [...Array((end - start) / step | 0).keys()].map(t => start + t * step)

export const esConnect = (config: Record<string, any>) => {

  const options: Record<string, any> = { node: config?.elasticsearch?.url || "http://localhost:9200", tls: { rejectUnauthorized: false } }

  if (config?.elasticsearch?.auth) options.auth = config.elasticsearch.auth

  if (typeof Bun !== "undefined") options.Connection = HttpConnection

  const client = new Client(options)

  return client
}

export const insert = async (esclient: Client, index: string, id: string | undefined, document: Record<string, any>, opts = {}) => {
  return await esclient.index({
    index: index,
    id: id || undefined,
    document: document,
    ...opts
  })
}

export const getRecord = async (esclient: Client, index: string, id: string): Promise<Record<string, any> | undefined> => {
  let ret = await esclient.get({
    index: index,
    id: id,
  }, { ignore: [404] })
  return ret?._source ? ret._source : undefined
}

export const getRecord2 = async (esclient: Client, index: string, id: string): Promise<Record<string, any> | undefined> => {
  let ret = await esclient.get({
    index: index,
    id: id,
  }, { ignore: [404] })
  return ret
}

export const searchIdRecord2 = async (esclient: Client, index: string, id: string): Promise<Record<string, any> | undefined> => {
  let ret = await esclient.search({
    index: index,
    query: {
      match: {
        _id: id
      }
    }
  }, { ignore: [404] })
  // @ts-ignore
  return ret && ret?.hits?.total?.value ? ret.hits.hits[0] : undefined
}

export const getAllRecords = async (esclient: Client, index: string, query: any, limit = 2000) => {

  let records: any[] = []

  let ret = await esclient.search({
    index: index,
    query: query || { match_all: {} },
    size: limit < 1000 ? limit : 1000,
    scroll: "10s"
  }, { ignore: [404] })

  // @ts-ignore
  if (ret?.error) throw new Error(JSON.stringify(ret.error))

  if (!ret) return records

  // @ts-ignore -- I think ts has got it wrong
  let total = ret?.hits?.total.value
  ret.hits.hits.map(rec => records.push(rec._source))

  while (total > records.length && records.length < limit) {

    let r = await esclient.scroll({ scroll_id: ret._scroll_id, scroll: "10s" })
    // console.log(`total: ${total} current: ${total.length}`)
    records.push(...r.hits.hits)
  }

  return records
}

export const deleteIndex = async (esclient: Client, index: string) => {
  return esclient.indices.delete({ index })
}

export const deleteRecord = async (esclient: Client, index: string, id: string) => {
  return esclient.delete({ index, id })
}

const test = async () => {

  let esclient = esConnect({ elasticsearch: { url: "https://localhost:9200", auth: { "username": "elastic", password: "elastic" } } })
  let del = false
  let ins = false

  if (del) await deleteIndex(esclient, "workflows")

  if (ins)
    await Promise
      .all(range(1001, 2000)
        .map(idx => insert(esclient, "workflows", `example.abc.${idx}`,
          { id: `example.abc.${idx}`, hello: `world${idx}` })
        )
      )

  let ret = await getAllRecords(esclient, "workflows", { match_all: {} })
  console.log(ret.length, ret[0])

  let rec = await getRecord(esclient, "workflows", "example.abc.22")
  console.log(rec)
}

if (process.argv[1] === import.meta.filename) {
  await test()
}

