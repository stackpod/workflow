import { Box } from "@stackpod/box"
import * as R from "ramda"
import { execExpression } from "../execute.js"
import { createLocals, ErrorToString, sleep } from "../utils.js"
import { ImapFlow } from "imapflow"
import { simpleParser } from "mailparser"

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
 *  profile:  IMAP profile
 */
export const getEmailWorkflow = (execId, args, level) => {
  let state

  let locals = createLocals("core.getemail", execId, level)

  const getImapClient = () => {
    let imapClient
    // Get the IMAP config
    let imapProfile = state.config.imap.filter(p => args.profile ? args.profile == p.profile : "default")
    if (imapProfile.length === 0 && args.profile) return Box.Err(`ERROR: IMAP profile ${args.profile} not found in config`)
    else if (imapProfile.length === 0) {
      if (state.config.imap.length === 0) return Box.Err(`ERROR: No IMAP profiles configured for default profile`)
    }
    imapProfile = imapProfile[0]
    let cfg = {
      host: imapProfile.host,
      port: imapProfile.port || 993,
      secure: imapProfile.secure === true ? imapProfile.secure : (imapProfile.port == 993 ? true : false),
      logger: false
    }
    if (imapProfile.authUser && imapProfile.authPassword) {
      cfg.auth = {
        user: imapProfile.authUser,
        pass: imapProfile.authPassword,
      }
    }
    try {
      imapClient = new ImapFlow(cfg)
    }
    catch (err) {
      return Box.Err(ErrorToString(err))
    }
    return Box({ imapClient, imapProfile })
  }

  const getOneEmail = async (client, profile) => {

    let msg = null
    let out = {}
    let lock
    try {
      lock = await client.getMailboxLock("INBOX")
    } catch (err) {
      return [`ERROR: core.getemail Unable to obtain INBOX lock, ${ErrorToString(err)}`, null]
    }
    try {
      for await (let _msg of client.fetch({ seen: false }, {
        source: true,
        headers: ["date", "subject"],
        flags: true,
        bodyStructure: true,
        envelope: true,
        bodyParts: ["text", "1.mime"],
        size: true
      })) {
        if (msg === null) {
          msg = _msg
          out = {}
        }
      }
      if (msg) {
        out = await simpleParser(msg.source)
        // console.log("out", out.from, "to", out.to, "text", out.text, "html", out.html, "attachments", out.attachments)
        // console.log("flags", msg.flags, msg.uid)
        let archiveFolder = args.archive || profile.archive
        if (archiveFolder) {
          if (!msg.flags.has("\\Seen")) {
            await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'])
          }
          await client.messageMove({ uid: msg.uid }, archiveFolder)
        }
        else {
          await client.messageRemove({ uid: msg.uid })
        }
      }
    }
    catch (err) {
      return ([err, null])
    }
    finally {
      if (lock) { lock.release(); lock = null }
    }
    if (lock) { lock.release(); lock = null }
    return ([null, R.omit(["headerLines"], out)])
  }

  const fetchEmail = async ({ imapClient, imapProfile }) => {

    let start = Date.now()

    try {
      await imapClient.connect();
    } catch (err) {
      return Box.Err(`ERROR: Cannot connect to IMAP server ${imapProfile.host}, ${ErrorToString(err)}`)
    }

    while (true) {
      let [err, msg] = await getOneEmail(imapClient, imapProfile)

      if (err) {
        try { imapClient.logout() } catch { }
        return Box.Err(ErrorToString(err))
      }
      else if (msg instanceof Object && Object.keys(msg).length) {
        try { imapClient.logout() } catch { }
        return Box(msg)
      }
      else {
        if (args.timeout && (Date.now() - start) > (args.timeout * 1000)) {
          try { imapClient.logout() } catch { }
          return Box({})
        }
        await sleep(args.interval ? (args.interval * 1000) : 10000)
        continue
      }
    }
    try { imapClient.logout() } catch { }
    return Box.Err(`ERROR: core.getemail, Internal error, exited the while loop`)
  }

  return Box.getState()
    .map(_state => { state = _state; return undefined })
    .chain(getImapClient)
    .chain(fetchEmail)
    .bimap(ErrorToString, R.identity)
}
