import { Box } from "@stackpod/box"
import * as R from "ramda"
import nodemailer from "nodemailer"
import { execExpression } from "../execute.js"

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
  let transporter
  args.request = args._request
  args.response = args._response

  let locals = createLocals("core.sendemail", level)

  const setTransporter = (state) => {
    // Get the SMTP config
    let smtpProfile = state.config.smtp.filter(p => args.profile ? args.profile == p.profile : "default")
    if(smtpProfile.length === 0 && args.profile) return Box.Err(`ERROR: SMTP profile ${args.profile} not found in config`)
    else if(smtpProfile.length === 0) {
      if(state.config.smtp.length === 0) return Box.Err(`ERROR: No SMTP profiles configured for default profile`)
      smtpProfile = state.config.smtp[0]
    }
    let cfg = {
      host: smtpProfile.endpoint,
      port: smtpProfile.port || 465,
      secure: smtpProfile.secure === true ? smtpProfile.secure : (smtpProfile.port == 465 ? true : false),
    }
    if(smtpProfile.authUser && smtpProfile.authPass) {
      cfg.auth = {
        user: smtpProfile.authUser,
        pass: smtpProfile.authPassword,
      }
    }
    try {
    transporter = nodemailer.createTransport(cfg)
    }
    catch(err) {
      return Box.Err(ErrorToString(err))
    }
    return Box()
  }

  return Box.getState()
    .map(_state => { state = _state; return undefined })
    .chain(() => safeFetched(args))
    .chain(result => args.process
      ? execExpression("process", args.process, state, { ...locals, ...state, vars: { ...result } }, {})
      : Box(result.body)
    )
    .bimap(ErrorToString, R.identity)
}
