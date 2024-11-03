import { Box } from "@stackpod/box"
import * as R from "ramda"
import nodemailer from "nodemailer"
import { execExpression } from "../execute.js"
import { createLocals, ErrorToString } from "../utils.js"

/*
 * sendEmailWorkflow:
 *
 * args:
 *  to: A list of email addresses  (required)
 *  cc: A list of email addresses
 *  bcc: A list of email addresses
 *  subject: Subject of the email
 *  body: HTML or Text of the email
 *  attachments: one or more attachments
 *  profile:  SMTP profile
 */
export const sendEmailWorkflow = (args, level) => {
  let state

  let locals = createLocals("core.sendemail", level)

  const setTransporter = () => {
    let transporter
    // Get the SMTP config
    let smtpProfile = state.config.smtp.filter(p => args.profile ? args.profile == p.profile : "default")
    if (smtpProfile.length === 0 && args.profile) return Box.Err(`ERROR: SMTP profile ${args.profile} not found in config`)
    else if (smtpProfile.length === 0) {
      if (state.config.smtp.length === 0) return Box.Err(`ERROR: No SMTP profiles configured for default profile`)
    }
    smtpProfile = smtpProfile[0]
    let cfg = {
      host: smtpProfile.host,
      port: smtpProfile.port || 587,
      secure: smtpProfile.secure === true ? smtpProfile.secure : (smtpProfile.port == 465 ? true : false),
    }
    if (smtpProfile.authUser && smtpProfile.authPassword) {
      cfg.auth = {
        user: smtpProfile.authUser,
        pass: smtpProfile.authPassword,
      }
    }
    try {
      transporter = nodemailer.createTransport(cfg)
    }
    catch (err) {
      return Box.Err(ErrorToString(err))
    }
    return Box({ transporter, smtpProfile })
  }

  const parseValues = ([key, value]) => {
    if ((key === "to" || key === "cc" || key === "bcc") && R.is(Array, value)) {
      return Box(value)
        .traverse(v => execExpression(key, v, state, locals, {}), Box.TraverseAll, Box.TraverseParallel)
        .map(ret => ([key, ret]))
    }
    else {
      return execExpression(key, value, state, locals, {})
        .map(v => ([key, v]))
    }
  }


  const sendEmail = async ({ transporter, smtpProfile }) => {
    return Box({
      from: args.from ? args.from : smtpProfile.from,
      to: args.to,
      cc: args.cc,
      bcc: args.bcc,
      subject: args.subject,
      text: args.body,
      html: args.html || undefined,
    })
      .map(R.toPairs)
      .traverse(parseValues, Box.TraverseAll, Box.TraverseParallel)
      .map(R.fromPairs)
      .chain(async params => {
        try {
          const info = await transporter.sendMail({
            ...params,
            attachments: args.attachments
          })
          return Box(info.messageId)
        }
        catch (err) {
          return Box.Err(`ERROR: core.sendemail failed, ${ErrorToString(err)}`)
        }
      })
  }

  return Box.getState()
    .map(_state => { state = _state; return undefined })
    .chain(setTransporter)
    .chain(sendEmail)
    .bimap(ErrorToString, R.identity)
}
