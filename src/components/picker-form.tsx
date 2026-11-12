import type { CatalogTask } from '@/lib/catalog-types'

export const PICKER_QUESTIONS = [
  '1. What do you want to do?',
  '2. What can you spend?',
  '3. How experienced are you?',
] as const

const BUDGET_OPTIONS = [
  ['free', 'Free only'],
  ['low', 'Low cost'],
  ['any', 'Any budget'],
] as const

const SKILL_OPTIONS = [
  ['beginner', 'Beginner'],
  ['intermediate', 'Intermediate'],
  ['pro', 'Advanced'],
] as const

/**
 * Native radios keep arrow-key movement inside the group and let Tab skip to
 * the next question. The input fills the pill so the global focus ring wraps
 * it; the check is the selected cue that is not color alone.
 */
function ChoicePills({
  name,
  options,
  defaultValue,
}: {
  name: string
  options: readonly (readonly [string, string])[]
  defaultValue: string
}) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-2 md:flex-nowrap">
      {options.map(([value, label]) => (
        <label
          key={value}
          className="relative inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-line px-3.5 text-sm font-medium has-[:checked]:border-indigo has-[:checked]:bg-indigo has-[:checked]:font-semibold has-[:checked]:text-white"
        >
          <input
            type="radio"
            name={name}
            value={value}
            required
            defaultChecked={value === defaultValue}
            className="peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-full bg-transparent"
          />
          <svg viewBox="0 0 16 16" aria-hidden="true" className="relative hidden size-4 shrink-0 peer-checked:block">
            <path
              d="M3.2 8.3 6.4 11.4 12.8 4.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="relative">{label}</span>
        </label>
      ))}
    </div>
  )
}

/**
 * Server-rendered. A client form was hydrating on every home visit and adding blocking time.
 * The card is capped and centered so the questions do not span the page. The desktop
 * negative margin cancels most of the homepage's 4rem section gap. From 768px up
 * the card and its button sit above an 800px fold; the large layout eases that pull.
 */
export function PickerForm({ tasks }: { tasks: CatalogTask[] }) {
  return (
    <form
      action="/result"
      method="get"
      className="mx-auto mt-3 w-full max-w-[40rem] space-y-2.5 rounded-3xl border border-line bg-card p-4 pb-28 shadow-sm md:-mt-16 md:space-y-2 md:px-5 md:pt-4 md:pb-2 lg:-mt-14"
    >
      <fieldset className="min-w-0">
        <legend className="font-semibold text-lg leading-tight">{PICKER_QUESTIONS[0]}</legend>
        <label htmlFor="task" className="mt-1 block text-sm text-muted">
          Pick the closest job.
        </label>
        <select
          id="task"
          name="task"
          required
          defaultValue={tasks[0]?.slug ?? ''}
          className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-paper px-3"
        >
          {tasks.map((task) => (
            <option key={task.slug} value={task.slug}>
              {task.name}
            </option>
          ))}
        </select>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="font-semibold text-lg leading-tight">{PICKER_QUESTIONS[1]}</legend>
        <ChoicePills name="budget" options={BUDGET_OPTIONS} defaultValue="any" />
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="font-semibold text-lg leading-tight">{PICKER_QUESTIONS[2]}</legend>
        <ChoicePills name="skill" options={SKILL_OPTIONS} defaultValue="beginner" />
      </fieldset>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper px-4 py-2.5 md:static md:z-auto md:border-0 md:bg-transparent md:px-0 md:pt-3 md:pb-0">
        <button
          type="submit"
          className="inline-flex min-h-14 w-full items-center justify-center rounded-full bg-indigo px-8 py-3 text-lg font-bold text-white shadow-[0_8px_22px_-6px_rgb(91_75_255/0.7)] focus-visible:outline-3! focus-visible:outline-offset-4! focus-visible:outline-solid! focus-visible:outline-focus!"
        >
          See my best bot
        </button>
      </div>
    </form>
  )
}
