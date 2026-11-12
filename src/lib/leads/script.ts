import { dbHost, isProdHost, UNPARSEABLE } from '../db/guard'

/**
 * The CLI refuses a production host unless the operator passed
 * --production-launch. Local file databases are allowed. An unparseable
 * URL is refused.
 */
export function leadsScriptRefuses(url: string, productionLaunch: boolean): boolean {
  const host = dbHost(url)
  if (host === UNPARSEABLE) return true
  if (host && isProdHost(host) && !productionLaunch) return true
  return false
}
