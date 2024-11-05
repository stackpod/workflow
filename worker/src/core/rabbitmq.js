import { Box } from "@stackpod/box"
import * as R from "ramda"
import nodemailer from "nodemailer"
import { execExpression, executeWorkflow } from "../execute.js"
import { createLocals, ErrorToString, sleep } from "../utils.js"
import amqp from "amqplib"
import chalk from "chalk"

const cm = chalk.magenta
const cy = chalk.yellow
const cr = chalk.red
const cg = chalk.green

const constructAmqpUrl = (args, profile) => {
  let url = "amqp://"

  if (profile.authUser && profile.authPassword) url += `${profile.authUser}:${profile.authPassword}@`
  url += (profile.host || "localhost")
  if (profile.port) url += ":" + profile.port
  return url
}

const constructBuffer = (message) => {
  let buf
  if (message && R.is(Object, message) && message.type === "Buffer" && message.data) {
    buf = Buffer.from(message)
  }
  else if (message && message instanceof Buffer) {
    buf = message
  }
  else if (message && R.is(String, message)) {
    // Let us try and see if it is JSON string
    buf = Buffer.from(message)
    try {
      let j = JSON.parse(message)
      if (R.is(Object, j) && j.type === "Buffer" && j.data) {
        buf = Buffer.from(j)
      }
    }
    catch (err) { }
  }
  return buf
}

const constructProfile = (state, args) => {
  let profile = state.config.rabbitmq.filter(p => args.profile ? args.profile == p.profile : "default")
  if (profile.length === 0 && args.profile) return [`ERROR: RabbitMQ profile ${args.profile} not found in config`, null]
  else if (profile.length === 0) {
    if (state.config.rabbitmq.length === 0) return [`ERROR: No Rabbitmq profiles configured for default profile`, null]
  }
  profile = profile[0]
  return [null, profile]
}

export const rabbitMqSend = (args, level) => {
  let state
  let connection
  let channel
  let locals = createLocals("core.rabbitmq.send", level)

  const sendToQueue = async () => {


    let [err, profile] = constructProfile(state, args)
    if (err) return Box.Err(err)

    if (!(profile.host && args.message && args.queue)) {
      return Box.Err(`ERROR: core.rabbitmq.send: Either "message" or "queue" or host config in profile is not available`)
    }

    const url = constructAmqpUrl(args, profile)

    try {
      connection = await amqp.connect(url)
      channel = await connection.createChannel()
      await channel.assertQueue(args.queue, { durable: true })
    }
    catch (err) {
      return Box.Err(`ERROR: core.rabbitmq.send Unable to connect or create channel/queue, ${ErrorToString(err)}`)
    }

    try {
      let buf = constructBuffer(args.message)
      await channel.sendToQueue(args.queue, buf)
    }
    catch (err) {
      return Box.Err(`ERROR: core.rabbitmq.send Unable to send message to queue, ${ErrorToString(err)}`)
    }
    setTimeout(() => connection.close(), 500)

    return Box("ok")
  }

  return Box.getState()
    .map(_state => { state = _state; return undefined })
    .chain(sendToQueue)
    .bimap(ErrorToString, R.identity)
}

export const rabbitMqPublish = (args, level) => {
  let state
  let locals = createLocals("core.rabbitmq.publish", level)
  let connection
  let channel

  const publish = async () => {


    let [err, profile] = constructProfile(state, args)
    if (err) return Box.Err(err)

    if (!(profile.host && args.message && args.exchange && args.type)) {
      return Box.Err(`ERROR: core.rabbitmq.publish: Either "message" or "exchange" or host config in profile is not available`)
    }

    const url = constructAmqpUrl(args, profile)

    try {
      connection = await amqp.connect(url)
      channel = await connection.createChannel()
      await channel.assertExchange(args.exchange, args.type, { durable: true })
    }
    catch (err) {
      return Box.Err(`ERROR: core.rabbitmq.publish Unable to connect or create channel/queue, ${ErrorToString(err)}`)
    }

    try {
      let buf = constructBuffer(args.message)
      await channel.publish(args.exchange, args.routingKey || '', buf)
    }
    catch (err) {
      return Box.Err(`ERROR: core.rabbitmq.publish Unable to publish message to exchange, ${ErrorToString(err)}`)
    }
    setTimeout(() => connection.close(), 500)

    return Box("ok")
  }

  return Box.getState()
    .map(_state => { state = _state; return undefined })
    .chain(publish)
    .bimap(ErrorToString, R.identity)
}

export const rabbitMqRecv = (args, level) => {
  let state

  let cancelled = false
  let consumerTag = null
  let closed = false
  let channel
  let connection
  let locals = createLocals("core.rabbitmq.recv", level)

  const callback = async (msg) => {
    if (msg) {
      let message = null
      try { message = msg.content.toString() } catch (err) { }
      if (message === "__STOP__") {
        console.log(`${locals.l2s()}DEBUG: core.rabbitmq.recv ${cy("Workflow")} ${cm(args.workflow)} received STOP message`)
        cancelled = true
      }
      console.log(`${locals.l2s()}DEBUG: core.rabbitmq.recv ${cy("Workflow")} ${cm(args.workflow)} recvd message. Size: ${cy(msg.content.length)}`)
      let result = {
        message,
        content: msg.content,
        consumerTag,
        deliveryTag: msg.fields.deliverTag,
        routingKey: msg.fields.routingKey,
        messageId: msg.properties.messageId,
        timestamp: msg.properties.timestamp
      }
      await Box.Ok()
        .chain(() => executeWorkflow(args.workflow, result, level + 1))
        .bimap(err => {
          console.log(`${locals.l2s()}DEBUG: core.rabbitmq.recv ${cy("Workflow")} ${cm(args.workflow)} had errors. Error: ${cr(err)}`)
        }, ret => {
          console.log(`${locals.l2s()}DEBUG: core.rabbitmq.recv ${cy("Workflow")} ${cm(args.workflow)} completed Ok. Sending Ack. Return: ${cy(ret)}`)
          channel.ack(msg)
        })
        .runPromise(state)
    }
  }
  const _callback = (msg) => {
    callback(msg).then().catch()
  }

  const recvFromQueue = async () => {

    let [err, profile] = constructProfile(state, args)
    if (err) return Box.Err(err)

    console.log("********** host:", profile.host, "queue:", args.queue, "workflow:", args.workflow)
    if (!(profile.host && args.queue && args.workflow)) {
      return Box.Err(`ERROR: core.rabbitmq.recv: Either "queue" or "workflow" or host config in profile is not available`)
    }

    const url = constructAmqpUrl(args, profile)

    try {
      connection = await amqp.connect(url)
      channel = await connection.createChannel()
      await channel.assertQueue(args.queue, { durable: true })
    }
    catch (err) {
      return Box.Err(`ERROR: core.rabbitmq.recv Unable to connect or create channel/queue, ${ErrorToString(err)}`)
    }

    try {
      let out = await channel.consume(args.queue, _callback, { noAck: false })
      consumerTag = out.consumerTag
    }
    catch (err) {
      return Box.Err(`ERROR: core.rabbitmq.recv Unable to setup consumer, ${ErrorToString(err)}`)
    }
    while (true) {
      if (cancelled) {
        if (!closed) {
          channel.close()
          connection.close()
        }
        closed = true
        return Box.Ok("channel and connection closed")
      }
      await sleep(10000)
    }
  }

  return Box.getState()
    .map(_state => { state = _state; return undefined })
    .chain(recvFromQueue)
    .bimap(ErrorToString, R.identity)
}

export const rabbitMqSubscribe = (args, level) => {
  let state

  let cancelled = false
  let consumerTag = null
  let closed = false
  let channel
  let connection
  let locals = createLocals("core.rabbitmq.subscribe", level)

  const callback = async (msg) => {
    if (msg) {
      let message = null
      try { message = msg.content.toString() } catch (err) { }
      if (message === "__STOP__") {
        console.log(`${locals.l2s()}DEBUG: core.rabbitmq.subscribe ${cy("Workflow")} ${cm(args.workflow)} received STOP message`)
        cancelled = true
      }
      console.log(`${locals.l2s()}DEBUG: core.rabbitmq.subscribe ${cy("Workflow")} ${cm(args.workflow)} recvd message. Size: ${cy(msg.content.length)}`)
      let result = {
        message,
        content: msg.content,
        consumerTag,
        deliveryTag: msg.fields.deliverTag,
        routingKey: msg.fields.routingKey,
        messageId: msg.properties.messageId,
        timestamp: msg.properties.timestamp
      }
      await Box.Ok()
        .chain(() => executeWorkflow(args.workflow, result, level + 1))
        .bimap(err => {
          console.log(`${locals.l2s()}DEBUG: core.rabbitmq.subscribe ${cy("Workflow")} ${cm(args.workflow)} had errors. Error: ${cr(err)}`)
        }, ret => {
          console.log(`${locals.l2s()}DEBUG: core.rabbitmq.subscribe ${cy("Workflow")} ${cm(args.workflow)} completed Ok. Sending Ack. Return: ${cy(ret)}`)
          channel.ack(msg)
        })
        .runPromise(state)
    }
  }
  const _callback = (msg) => {
    callback(msg).then().catch()
  }

  const subscribe = async () => {

    let [err, profile] = constructProfile(state, args)
    if (err) return Box.Err(err)

    if (!(profile.host && args.exchange && args.type && args.workflow)) {
      return Box.Err(`ERROR: core.rabbitmq.subscribe: Either "exchange" or "type" or "workflow" or host config in profile is not available`)
    }

    const url = constructAmqpUrl(args, profile)

    try {
      connection = await amqp.connect(url)
      channel = await connection.createChannel()
      await channel.assertExchange(args.exchange, args.type, { durable: true })
    }
    catch (err) {
      return Box.Err(`ERROR: core.rabbitmq.subscribe Unable to connect or create channel/queue, ${ErrorToString(err)}`)
    }

    let q
    try {
      q = await channel.assertQueue('', { exclusive: true })
      let promises = []
      let routingKeys = R.is(Array, args.routingKeys) ? args.routingKeys : ['']
      routingKeys.map(key => {
        promises.push(channel.bindQueue(q.queue, args.exchange, key))
      })
      await Promise.all(promises)
    }
    catch (err) {
      return Box.Err(`ERROR: core.rabbitmq.subscribe Unable to create and bind to temp queue, ${ErrorToString(err)}`)
    }

    try {
      let out = await channel.consume(q.queue, _callback, { noAck: false })
      consumerTag = out.consumerTag
      console.log(`${locals.l2s()}DEBUG: core.rabbitmq.subscribe ${cm(args.workflow)} consumer tag setup ${cy(consumerTag)}`)
    }
    catch (err) {
      return Box.Err(`ERROR: core.rabbitmq.subscribe Unable to setup consumer, ${ErrorToString(err)}`)
    }
    while (true) {
      if (cancelled) {
        if (!closed) {
          channel.close()
          connection.close()
        }
        closed = true
        return Box.Ok("channel and connection closed")
      }
      await sleep(10000)
    }
  }

  return Box.getState()
    .map(_state => { state = _state; return undefined })
    .chain(subscribe)
    .bimap(ErrorToString, R.identity)
}
