'use client'

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-4">
      <h1 className="font-bold text-5xl">Something went wrong</h1>
      <p>Try again. If it keeps happening, come back in a few minutes.</p>
      <button type="button" onClick={() => reset()} className="min-h-12 rounded-full bg-indigo px-5 font-medium text-white">
        Try again
      </button>
    </div>
  )
}
