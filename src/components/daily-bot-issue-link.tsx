/** The first published issue of The Daily Bot, on Beehiiv's web archive. */
export const DAILY_BOT_ISSUE_1_URL = 'https://thedailybot.beehiiv.com/p/prices-we-caught-changing-issue-1'

export function ReadIssueOneLink() {
  return (
    <a className="underline" href={DAILY_BOT_ISSUE_1_URL} rel="noopener">
      Read issue #1
    </a>
  )
}
