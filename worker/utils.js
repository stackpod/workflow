import * as R from "ramda"

export const matchValue = (expected, actual) => {
  if (R.is(String, actual) && R.is(String, expected)) {
    if (expected.startsWith("/") && expected.endsWith("/")) {
      try {
        const regex = new RegExp(expected)
        return regex.test(actual)
      }
      catch (err) {
        return err.message
      }
    }
  }
  return "Invalid or unimplemented types of expected/actual provided"
}
