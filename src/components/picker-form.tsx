'use client'

import { useRef } from 'react'
import { track } from '@/lib/analytics'
import type { CatalogTask } from '@/lib/catalog-types'

export function PickerForm({ tasks }: { tasks: CatalogTask[] }) {
  const started = useRef(false)

  function start() {
    if (started.current) return
    started.current = true
    track('quiz_start')
  }

  return (
    <form
      action="/result"
      method="get"
      className="space-y-8 rounded-3xl border border-line bg-card p-6 shadow-sm md:p-8"
      onFocus={start}
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget)
        track('quiz_complete', {
          task: String(data.get('task') ?? ''),
          budget: String(data.get('budget') ?? ''),
          skill: String(data.get('skill') ?? ''),
        })
      }}
    >
      <fieldset>
        <legend className="font-semibold text-2xl">1. What do you want to do?</legend>
        <label htmlFor="task" className="mt-3 block text-sm text-muted">
          Pick the closest job.
        </label>
        <select
          id="task"
          name="task"
          required
          defaultValue={tasks[0]?.slug ?? ''}
          className="mt-2 min-h-12 w-full rounded-xl border border-line bg-paper px-3"
        >
          {tasks.map((task) => (
            <option key={task.slug} value={task.slug}>
              {task.name}
            </option>
          ))}
        </select>
      </fieldset>

      <fieldset>
        <legend className="font-semibold text-2xl">2. What can you spend?</legend>
        <div className="mt-3 grid gap-2">
          {[
            ['free', 'Free only'],
            ['low', 'Low cost'],
            ['any', 'Any budget'],
          ].map(([value, label]) => (
            <label key={value} className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-3">
              <input type="radio" name="budget" value={value} required defaultChecked={value === 'any'} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-semibold text-2xl">3. How experienced are you?</legend>
        <div className="mt-3 grid gap-2">
          {[
            ['beginner', 'Beginner'],
            ['intermediate', 'Intermediate'],
            ['pro', 'Advanced'],
          ].map(([value, label]) => (
            <label key={value} className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-3">
              <input type="radio" name="skill" value={value} required defaultChecked={value === 'beginner'} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <button type="submit" className="min-h-12 w-full rounded-full bg-indigo px-6 font-medium text-white md:w-auto">
        See my best bot
      </button>
    </form>
  )
}
