import Link from 'next/link'
import type { ReactNode } from 'react'
import { parseGuideMarkdown, type Inline } from '@/lib/guide-markdown'

function inline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === 'text') return node.text
    if (node.type === 'strong') return <strong key={index}>{inline(node.children)}</strong>
    if (node.type === 'em') return <em key={index}>{inline(node.children)}</em>
    if (node.kind === 'internal') {
      return (
        <Link key={index} href={node.href} className="underline">
          {inline(node.children)}
        </Link>
      )
    }
    return (
      <a key={index} href={node.href} rel="nofollow noopener" className="underline">
        {inline(node.children)}
      </a>
    )
  })
}

export function GuideMarkdown({ markdown }: { markdown: string }) {
  return (
    <>
      {parseGuideMarkdown(markdown).map((block, index) => {
        if (block.type === 'heading') {
          return block.level === 2 ? (
            <h2 key={index} id={block.id} className="pt-4 font-semibold text-3xl">{block.text}</h2>
          ) : (
            <h3 key={index} id={block.id} className="pt-2 font-semibold text-xl">{block.text}</h3>
          )
        }
        if (block.type === 'paragraph') return <p key={index}>{inline(block.children)}</p>
        if (block.type === 'list') {
          return (
            <ul key={index} className="list-disc space-y-1 pl-6">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{inline(item)}</li>
              ))}
            </ul>
          )
        }
        return (
          <div key={index} className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {block.head.map((cell, cellIndex) => (
                    <th key={cellIndex} scope="col" className="border-b border-line py-2 pr-3">{inline(cell)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="border-b border-line py-2 pr-3 align-top">{inline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </>
  )
}
