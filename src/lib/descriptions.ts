const OWN_PICK = ' Or get your own pick in 30 seconds.'

/** Drops the closing sentence when a long task name would push the description past 155 characters. */
export function bestGuideDescription(taskName: string): string {
  const lead = `Which AI should you use for ${taskName.toLowerCase()}? Our pick and the closest alternatives, side by side.`
  const full = `${lead}${OWN_PICK}`
  return full.length <= 155 ? full : lead
}

/**
 * The compare page does not render a third tool, so that clause is omitted.
 * The closing sentence drops when the pair names would pass 155 characters.
 */
export function compareDescription(leftName: string, rightName: string): string {
  const lead = `${leftName} vs ${rightName}: which AI tool is right for you? A one-line verdict, a side-by-side table.`
  const full = `${lead}${OWN_PICK}`
  return full.length <= 155 ? full : lead
}
