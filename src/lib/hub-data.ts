import 'server-only'

import { listTaskCandidates, listTasks } from './catalog'
import { hubRows, type HubRow } from './seo-pages'

/** Top pick for every task, from the same read /best/[task] uses. */
export async function loadHubRows(): Promise<HubRow[]> {
  const tasks = await listTasks()
  const loaded = await Promise.all(tasks.map((task) => listTaskCandidates(task.slug)))
  const ranked = new Map(tasks.map((task, index) => [task.slug, loaded[index]?.tools ?? []]))
  return hubRows(tasks, ranked)
}
