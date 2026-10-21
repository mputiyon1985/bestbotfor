/**
 * Search titles and descriptions from Nova's seo-meta-recommendations.csv (Oct 2026).
 * Titles are full rendered titles (absoluteTitle, no ' · BestBotFor' suffix), <= 60 chars.
 * Per-tool rows are not used: tool pages generate their meta from catalog data instead.
 * "our pick (X)" names were checked against the live /best ItemList on Oct 21, 2026.
*/
export type SeoMeta = { title: string; description: string }

export const SEO_META: Readonly<Record<string, SeoMeta>> = {
  "/guides/automation": { title: "Make vs n8n vs Zapier: AI Automation Tools Compared", description: "Make, n8n or Zapier? Our pick for small-business automation, real plan prices, free tiers and who should skip each. Checked Oct 2026." },
  "/guides/coding": { title: "AI Coding Assistants Compared: Cursor vs Copilot + More", description: "Cursor, Claude Code, GitHub Copilot or Codex? Our pick by coding job, verified Cursor pricing (Plus $8, Premium $30) and who should skip it." },
  "/guides/images": { title: "AI Image Generators Compared: Midjourney + 6 Picks", description: "Midjourney, Ideogram, Recraft or Krea? Our pick by image job, Midjourney plans from $10/mo, free options, and who should skip each." },
  "/guides/meetings": { title: "AI Meeting Note Takers: Otter vs Fireflies + 4 More", description: "Otter, Fireflies, Fathom or Granola? Our pick for meeting notes, free plans for Zoom, Teams and Meet, and who should skip each." },
  "/guides/seo": { title: "AI SEO Tools Compared (2026): Surfer vs Ahrefs + More", description: "Surfer, Ahrefs, Semrush or Clearscope? Our pick by SEO job, real plan prices and who should skip each. Get your own pick in 30 seconds." },
  "/guides/video": { title: "AI Video Tools Compared (2026): Runway + 6 Alternatives", description: "Runway, Synthesia, HeyGen or Descript? Our pick by video job, real plan prices, free tiers and who should skip each. Checked Oct 2026." },
  "/guides/voice": { title: "AI Voice Generators Compared: ElevenLabs + 6 Picks", description: "ElevenLabs or an alternative? Our pick for AI voiceovers, the free plan and $6 Starter, plus six alternatives by use case." },
  "/guides/writing": { title: "AI Writing Tools Compared: Claude vs Jasper + 5 More", description: "Claude, Jasper, ChatGPT or a specialist? Our pick for marketing writing, Claude Pro at $20/mo, free plans, and who should skip each." },
  "/best/coding": { title: "Best AI for coding (2026): Our Pick + Free Options", description: "The best AI for coding for small businesses: our pick (Cursor) plus up to six alternatives, with prices and free plans. Get your own pick in 30 seconds." },
  "/best/vibe-coding": { title: "Best AI app builders (2026): Our Pick + Free Options", description: "The best AI app builders for small businesses: our pick (Lovable) plus up to six alternatives, with prices and free plans. Get your own pick in 30 seconds." },
  "/best/chat": { title: "Best AI chatbots (2026): Our Pick + Free Options", description: "The best AI chatbots for small businesses: our pick (ChatGPT) plus up to six alternatives, with prices and free plans. Get your own pick in 30 seconds." },
  "/best/research": { title: "Best AI research tools (2026): Our Pick + Free Options", description: "The best AI research tools: our pick (Perplexity) plus up to six alternatives, with prices and free plans. Get your pick in 30 seconds." },
  "/best/video": { title: "Best AI video tools (2026): Our Pick + Free Options", description: "The best AI video tools for small businesses: our pick (Runway) plus up to six alternatives, with prices and free plans. Get your own pick in 30 seconds." },
  "/best/voice": { title: "Best AI voice generators (2026): Our Pick + Free Options", description: "The best AI voice generators: our pick (ElevenLabs) plus up to six alternatives, with prices and free plans. Get your pick in 30 seconds." },
  "/best/images": { title: "Best AI image generators (2026): Our Pick + Free Options", description: "The best AI image generators: our pick (Midjourney) plus up to six alternatives, with prices and free plans. Get your pick in 30 seconds." },
  "/best/design": { title: "Best AI design tools (2026): Our Pick + Free Options", description: "The best AI design tools for small businesses: our pick (Canva) plus up to six alternatives, with prices and free plans. Get your own pick in 30 seconds." },
  "/best/writing": { title: "Best AI writing tools (2026): Our Pick + Free Options", description: "The best AI writing tools for small businesses: our pick (Claude) plus up to six alternatives, with prices and free plans. Get your own pick in 30 seconds." },
  "/best/seo": { title: "Best AI SEO tools (2026): Our Pick + Free Options", description: "The best AI SEO tools for small businesses: our pick (Surfer) plus up to six alternatives, with prices and free plans. Get your own pick in 30 seconds." },
  "/best/automation": { title: "Best AI automation tools (2026): Our Pick + Free Options", description: "The best AI automation tools: our pick (Make) plus up to six alternatives, with prices and free plans. Get your pick in 30 seconds." },
  "/best/agents": { title: "Best AI agent builders (2026): Our Pick + Free Options", description: "The best AI agent builders: our pick (Relevance AI) plus up to six alternatives, with prices and free plans. Get your pick in 30 seconds." },
  "/best/meetings": { title: "Best AI meeting note takers (2026): Our Pick + Free Options", description: "The best AI meeting note takers: our pick (Otter) plus up to six alternatives, with prices and free plans. Get your pick in 30 seconds." },
  "/best/music": { title: "Best AI music generators (2026): Our Pick + Free Options", description: "The best AI music generators: our pick (Suno) plus up to six alternatives, with prices and free plans. Get your pick in 30 seconds." },
  "/best/games": { title: "Best AI tools for game assets (2026): Our Pick", description: "The best AI tools for game assets: our pick (Inworld) plus up to six alternatives, with prices and free plans. Get your pick in 30 seconds." },
  "/best/websites": { title: "Best AI website builders (2026): Our Pick + Free Options", description: "The best AI website builders: our pick (Framer) plus up to six alternatives, with prices and free plans. Get your pick in 30 seconds." },
  "/best/backend": { title: "Best AI backend tools (2026): Our Pick + Free Options", description: "The best AI backend tools: our pick (Supabase) plus up to six alternatives, with prices and free plans. Get your pick in 30 seconds." },
}

export function seoMeta(path: string): SeoMeta | undefined {
  return Object.hasOwn(SEO_META, path) ? SEO_META[path] : undefined
}
