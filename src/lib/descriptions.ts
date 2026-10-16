const OWN_PICK = ' Or get your own pick in 30 seconds.'

const TASK_GERUNDS: Record<string, string> = {
  add: 'adding',
  automate: 'automating',
  brainstorm: 'brainstorming',
  build: 'building',
  chat: 'chatting',
  create: 'creating',
  design: 'designing',
  generate: 'generating',
  improve: 'improving',
  make: 'making',
  research: 'researching',
  take: 'taking',
  write: 'writing',
}

/** "Make music" → "making music". The command form reads as an infinitive after "for". */
export function taskGerund(taskName: string): string {
  return taskName
    .split(' ')
    .map((word, index, words) => {
      const lower = word.toLowerCase()
      const conjugate = index === 0 || words[index - 1]?.toLowerCase() === 'and'
      if (!conjugate) return lower === 'seo' ? 'SEO' : lower
      return TASK_GERUNDS[lower] ?? lower
    })
    .join(' ')
}

export function bestGuideTitle(taskName: string): string {
  return `Best AI for ${taskGerund(taskName)}`
}

export function bestGuideHeading(taskName: string): string {
  return `Best AI tool for ${taskGerund(taskName)}`
}

export function bestGuideCrumb(taskName: string): string {
  return `Best for ${taskGerund(taskName)}`
}

export function bestGuideQuestion(taskName: string): string {
  return `What is the best AI tool for ${taskGerund(taskName)}?`
}

export function bestGuideFitAnswer(taskName: string, toolName: string): string {
  return `${toolName} is the top pick in this catalog for ${taskGerund(taskName)}.`
}

export function bestGuideLead(taskName: string, toolName: string): string {
  return `The best AI tool for ${taskGerund(taskName)} is ${toolName}.`
}

export function bestGuideListName(taskName: string): string {
  return `Best AI tools for ${taskGerund(taskName)}`
}

/** Drops the closing sentence when a long task name would push the description past 155 characters. */
export function bestGuideDescription(taskName: string): string {
  const lead = `Which AI should you use for ${taskGerund(taskName)}? Our pick and the closest alternatives, side by side.`
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
