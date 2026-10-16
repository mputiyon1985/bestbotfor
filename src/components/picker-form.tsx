import type { CatalogTask } from '@/lib/catalog-types'

/** Server-rendered. A client form was hydrating on every home visit and adding blocking time. */
export function PickerForm({ tasks }: { tasks: CatalogTask[] }) {
  return (
    <form action="/result" method="get" className="space-y-6 rounded-3xl border border-line bg-card p-4 pb-24 shadow-sm md:space-y-8 md:p-8">
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

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper px-4 pt-3 pb-3 md:static md:z-auto md:border-0 md:bg-transparent md:p-0">
        <button type="submit" className="min-h-12 w-full rounded-full bg-indigo px-6 font-medium text-white md:w-auto">
          See my best bot
        </button>
      </div>
    </form>
  )
}
