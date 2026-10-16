import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { parseHowWeRate } from '@/lib/how-we-rate'
import { pageMetadata } from '@/lib/metadata'

const markdown = readFileSync(path.join(process.cwd(), 'src/content/how-we-rate.md'), 'utf8')

export const metadata: Metadata = pageMetadata({
  title: 'How we rate',
  description:
    'BestBotFor scores each AI tool against rivals that do the same job. Quality is 40%, features 25%, value 20%, and ease 15%. The score is editorial.',
  path: '/how-we-rate',
})

export default function HowWeRatePage() {
  const blocks = parseHowWeRate(markdown)
  return (
    <article className="max-w-2xl space-y-4">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'How we rate', path: '/how-we-rate' }]} />
      {blocks.map((block, index) => {
        if (block.type === 'h1') {
          return (
            <h1 key={index} className="font-bold text-5xl">
              {inline(block.text)}
            </h1>
          )
        }
        if (block.type === 'ul') {
          return (
            <ul key={index} className="list-disc space-y-2 pl-5">
              {block.items.map((item) => (
                <li key={item}>{inline(item)}</li>
              ))}
            </ul>
          )
        }
        return <p key={index}>{inline(block.text)}</p>
      })}
    </article>
  )
}

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}
