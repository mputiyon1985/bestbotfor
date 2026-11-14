import { VISIBLE_TOOL_COUNT_WORD, type VisibleToolCountText } from '@/lib/visible-tool-count'

/**
 * The digits, “AI tools tracked.”, and “1 right pick for you.” are one sentence,
 * so a screen reader says the count once. font-headline keeps this largest text
 * on the system face: Poppins swaps in later and must not move the paint.
 * Narrow screens stack the figure over the words and drop the gradient rule.
 */
export function HeroStat({ count }: { count: VisibleToolCountText }) {
  const figure = (
    <span data-hero-count className="whitespace-nowrap text-5xl leading-[0.9] tracking-[-0.05em] text-accent tabular-nums lg:text-[6rem]">
      {count.formatted}
    </span>
  )
  const rule = <span data-hero-rule aria-hidden="true" className="hero-stat-rule hidden self-stretch lg:block" />
  const words = (
    <span data-hero-copy className="whitespace-nowrap text-xl leading-[1.15] tracking-[-0.025em] lg:text-[1.75rem]"><span className="sr-only"> </span>AI {count.noun} {VISIBLE_TOOL_COUNT_WORD}.<br /><span className="sr-only"> </span><span className="text-hero-pick">1</span> right pick for you.</span>
  )
  return (
    <p data-hero-stat className="flex flex-col items-start gap-2 font-headline text-ink lg:flex-row lg:items-center lg:gap-5">{figure}{rule}{words}</p>
  )
}
