import 'server-only'

import { headers } from 'next/headers'
import { listTaskCandidates } from './catalog'
import { buildFreePage } from './free-page'
import { freePageClock } from './free-page-hooks'
import { isFreePageTask, FREE_PAGE_MIN_TOOLS } from './free-plan'

/** Loads one /best/[task]/free page, or null when the task has no free page. */
export async function loadFreePage(taskSlug: string) {
  if (!isFreePageTask(taskSlug)) return null
  const [loaded, headerStore] = await Promise.all([listTaskCandidates(taskSlug), headers()])
  if (!loaded) return null
  const { now, overrides } = freePageClock((name) => headerStore.get(name), Date.now())
  const page = buildFreePage(loaded.tools, now, overrides)
  if (page.tools.length < FREE_PAGE_MIN_TOOLS) return null
  return { task: loaded.task, ranked: loaded.tools, now, ...page }
}
