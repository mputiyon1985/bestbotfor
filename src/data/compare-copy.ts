/**
 * Curated /compare copy. Make, Murf, Lovable, v0, and Synthesia prices were re-checked Oct 18, 2026.
 * Each page's "Last checked" line uses the vendor "checked" dates in its sources.
 * When those dates agree, that date is the line. When they differ, the line uses the earliest,
 * so a later re-check of one tool does not claim the other tool was read that day.
 * `{{a:task}}` and `{{b:task}}` are fit scores filled from the catalog at render time.
 * The numbers in the handoff are a snapshot for review, not a second source of truth.
 * "Our rating" cells are also filled from the catalog, not stored here.
 */

export type CompareTextRow = {
  label: string
  kind: 'text'
  a: string
  b: string
  source: string
  /** Shown instead of `a` after this UTC day (YYYY-MM-DD). */
  aAfter?: { after: string; text: string }
}

export type CompareFitRow = {
  label: string
  kind: 'fit'
  task: string
  source: string
}

export type CompareRatingRow = {
  label: string
  kind: 'rating'
  source: string
}

/** Skill cells are `skillLabel` for each tool, so the catalog stays the source. */
export type CompareSkillRow = {
  label: string
  kind: 'skill'
  source: string
}

export type CompareRow = CompareTextRow | CompareFitRow | CompareRatingRow | CompareSkillRow

export type CompareCopy = {
  /** Canonical pair slug, `{a}-vs-{b}`, matching comparePairSeeds order. */
  slug: string
  metaTitle: string
  metaDescription: string
  heading: string
  nameA: string
  nameB: string
  verdict: string
  checkedLine: string
  pickAHeading: string
  pickBHeading: string
  pickA: readonly string[]
  pickB: readonly string[]
  rows: readonly CompareRow[]
  secondaryNote: string
  cta: string
  sources: readonly string[]
  ranking?: { href: string; label: string }
}

const CHECKED_DATE = /(?:^|[^A-Za-z-])checked (Oct \d{1,2}, \d{4})/g

/**
 * Latest vendor check date when every price source on the page shares it.
 * Earliest when they differ, because the later date would overclaim the older source.
 */
export function comparePageCheckedLine(sources: readonly string[]): string {
  const dates = new Set<string>()
  for (const source of sources) {
    for (const match of source.matchAll(CHECKED_DATE)) {
      const date = match[1]
      if (date) dates.add(date)
    }
  }
  const date = [...dates].sort(compareCheckedDate)[0]
  if (!date) throw new Error('Compare page is missing a vendor checked date')
  return `Last checked ${date}. Prices change, so confirm on the vendor's site before you pay.`
}

function compareCheckedDate(left: string, right: string): number {
  return checkedDateValue(left) - checkedDateValue(right)
}

function checkedDateValue(label: string): number {
  const match = /^Oct (\d{1,2}), (\d{4})$/.exec(label)
  if (!match) return Number.MAX_SAFE_INTEGER
  return Number(match[2]) * 1000 + Number(match[1])
}

export const COMPARE_SECONDARY_NOTE =
  "[S] = secondary source (third party), not read directly on the vendor's page."

export const COMPARE_DIGEST_FINE_PRINT = 'Free AI newsletter, first issue coming soon. Unsubscribe anytime.'

const catalogSource = 'BestBotFor catalog: src/data/scores-v2.3.csv (Our rating, category rank) and live /best pages (fit %), read Oct 17, 2026'

const compareCopyDraft: readonly Omit<CompareCopy, 'checkedLine'>[] = [
  {
    slug: 'elevenlabs-vs-murf',
    metaTitle: 'ElevenLabs vs Murf: Which AI Voice Tool Is Right for You?',
    metaDescription:
      'ElevenLabs vs Murf: one-line verdict, prices checked Oct 2026, and a side-by-side table. Or get your own AI pick in 30 seconds.',
    heading: 'ElevenLabs vs Murf',
    nameA: 'ElevenLabs',
    nameB: 'Murf',
    verdict:
      'For most voiceovers, pick **ElevenLabs**: it scores higher on our voiceover job ({{a:voice}} vs {{b:voice}}) and its free plan gives 10,000 credits a month. Pick **Murf** if you want a studio-style editor for scripts and slides, billed by hours of voice.',
    pickAHeading: 'Pick ElevenLabs if…',
    pickBHeading: 'Pick Murf if…',
    pickA: [
      'You want the widest voice toolkit (text to speech, cloning, dubbing, sound effects, music) on one credit balance',
      'You want to start free, or pay as little as $6 a month',
      'You need instant voice cloning (from Starter)',
    ],
    pickB: [
      'You make narrated slides, training or explainer videos in a timeline editor',
      'You prefer a flat number of voice hours per month to a credit pool',
      'You need a developer API at low per-character rates ($0.01 per 1,000 characters on Falcon)',
    ],
    rows: [
      { label: 'Our rating', kind: 'rating', source: 'BestBotFor catalog' },
      { label: 'Fit: create a voiceover', kind: 'fit', task: 'voice', source: 'bestbotfor.com/best/voice' },
      {
        label: 'Free plan',
        kind: 'text',
        a: 'Yes: 10,000 credits a month, no commercial license',
        b: 'Studio: 10 minutes of voice generation, no downloads. API: $10 free credit',
        source: '[1]; [2]',
      },
      {
        label: 'Paid from',
        kind: 'text',
        a: 'Starter $6/mo; Creator $22/mo',
        b: 'Studio Creator $29/mo, or $19/mo billed yearly',
        source: '[1]; [2]',
      },
      {
        label: 'How you pay',
        kind: 'text',
        a: 'Shared credits (text to speech about 1 credit per character)',
        b: 'Studio: hours of voice generation. API: per 1,000 characters',
        source: '[1]; [2]',
      },
      {
        label: 'Voice cloning',
        kind: 'text',
        a: 'Instant from Starter; professional from Creator',
        b: 'Professional cloning listed under Enterprise',
        source: '[1]; [2]',
      },
      { label: 'Skill level', kind: 'text', a: 'Beginner', b: 'Beginner', source: 'BestBotFor catalog' },
    ],
    secondaryNote: COMPARE_SECONDARY_NOTE,
    cta: 'Voice tools change prices almost monthly. Get **The Daily Bot** for new AI tools and price changes, so you hear when this verdict changes.',
    sources: [
      '[1] ElevenLabs pricing: https://elevenlabs.io/pricing (vendor, checked Oct 17, 2026)',
      '[2] Murf pricing: https://murf.ai/pricing (vendor, checked Oct 18, 2026)',
      catalogSource,
    ],
    ranking: { href: '/best/voice', label: 'See the full Voice ranking' },
  },
  {
    slug: 'n8n-vs-make',
    metaTitle: 'n8n vs Make: Which Automation Tool Is Right for You?',
    metaDescription:
      'n8n vs Make: who should pick which, prices checked Oct 2026, and a side-by-side table. Or get your own AI tool pick in 30 seconds.',
    heading: 'n8n vs Make',
    nameA: 'n8n',
    nameB: 'Make',
    verdict:
      'Pick **Make** if you want visual automations without code and a real free plan. Pick **n8n** if you are technical, want to build AI agents, or want to self-host for free. It is #1 in our Automation rating.',
    pickAHeading: 'Pick n8n if…',
    pickBHeading: 'Pick Make if…',
    pickA: [
      'You are comfortable with code steps (JavaScript or Python) and APIs',
      'You want to build agents (AI Agent node, MCP) as well as workflows',
      'You want to self-host for free (Community Edition) or pay per full workflow run, not per step',
    ],
    pickB: [
      'You want a no-code, visual builder with 3,500+ apps',
      'You want a free cloud plan (1,000 credits a month)',
      'You run simpler, lower-volume automations',
    ],
    rows: [
      { label: 'Our rating', kind: 'rating', source: 'BestBotFor catalog' },
      { label: 'Fit: automate a workflow', kind: 'fit', task: 'automation', source: 'bestbotfor.com/best/automation' },
      { label: 'Fit: build an agent', kind: 'fit', task: 'agents', source: 'bestbotfor.com/best/agents' },
      {
        label: 'Free option',
        kind: 'text',
        a: 'Self-hosted Community Edition (free). Cloud: free trial, 1,000 executions, no card',
        b: 'Free cloud plan: 1,000 credits a month',
        source: '[3]; [4]',
      },
      {
        label: 'Paid from',
        kind: 'text',
        a: 'Starter €20/mo billed yearly; Pro €50/mo billed yearly',
        b: 'Core $12/mo billed yearly, or $16 monthly (10,000 credits). Pro $21/mo billed yearly, or $28 monthly. Teams $38/mo billed yearly, or $51 monthly [S]',
        source: '[3]; [S2]',
      },
      {
        label: 'How you pay',
        kind: 'text',
        a: 'Per execution (one full workflow run, any number of steps)',
        b: 'Per credit (most actions use 1 credit)',
        source: '[3]; [4]',
      },
      { label: 'Skill level', kind: 'text', a: 'Advanced', b: 'Intermediate', source: 'BestBotFor catalog' },
    ],
    secondaryNote: COMPARE_SECONDARY_NOTE,
    cta: 'Automation pricing shifts often (Make moved to credits on Aug 27). Get **The Daily Bot** for AI tool and pricing changes in plain English.',
    sources: [
      '[3] n8n pricing: https://n8n.io/pricing/ (vendor, checked Oct 17, 2026)',
      '[4] Make pricing (FAQ: credits, free plan): https://www.make.com/en/pricing (vendor, checked Oct 18, 2026)',
      '[S2] Make plan prices (secondary: plan cards render client-side): https://meetalog.com/make-com-pricing/ ; https://www.mainsum.com/make-vs-n8n/ (third party, prices re-checked Oct 18, 2026)',
      catalogSource,
    ],
    ranking: { href: '/best/automation', label: 'See the full Automation ranking' },
  },
  {
    slug: 'heygen-vs-synthesia',
    metaTitle: 'HeyGen vs Synthesia: Which AI Avatar Video Tool Fits You?',
    metaDescription:
      'HeyGen vs Synthesia: one-line verdict, prices checked Oct 2026, and a side-by-side table. Or get your own AI tool pick in 30 seconds.',
    heading: 'HeyGen vs Synthesia',
    nameA: 'HeyGen',
    nameB: 'Synthesia',
    verdict:
      'Pick **Synthesia** for training and business video. It edges our "make a video" fit ({{b:video}} vs {{a:video}}) and supports 140+ languages. Pick **HeyGen** for marketing and creator videos: it has a free plan with 3 short videos a month, and Pro exports in 4K.',
    pickAHeading: 'Pick HeyGen if…',
    pickBHeading: 'Pick Synthesia if…',
    pickA: [
      'You make marketing, social or creator videos',
      'You want 4K export (Pro, $49/mo)',
      'You want a custom avatar that looks and sounds like you',
    ],
    pickB: [
      'You make training, onboarding or internal business video',
      'You need many languages (140+ languages and voices)',
      'You want a free plan with 10 minutes of video a month (watermarked)',
    ],
    rows: [
      { label: 'Our rating', kind: 'rating', source: 'BestBotFor catalog' },
      { label: 'Fit: make a video', kind: 'fit', task: 'video', source: 'bestbotfor.com/best/video' },
      {
        label: 'Free plan',
        kind: 'text',
        a: '3 videos a month, up to 1 minute each',
        b: 'Basic: 10 minutes of video a month + 500 credits, watermark',
        source: '[5]; [6]',
      },
      {
        label: 'Paid from',
        kind: 'text',
        a: 'Creator $29/mo ($24/mo billed yearly)',
        b: 'Starter $29/mo billed monthly',
        source: '[5]; [6]',
      },
      {
        label: 'Next tier',
        kind: 'text',
        a: 'Pro $49/mo, 4K export',
        b: 'Pro $89/mo monthly, or $64/mo billed yearly',
        source: '[5]; [6]',
      },
      {
        label: 'Max export',
        kind: 'text',
        a: '4K (Pro and up)',
        b: 'Full HD 1920x1080 MP4',
        source: '[5]; [6]',
      },
      { label: 'Skill level', kind: 'text', a: 'Beginner', b: 'Beginner', source: 'BestBotFor catalog' },
    ],
    secondaryNote: COMPARE_SECONDARY_NOTE,
    cta: 'AI video plans change credits and prices fast. Get **The Daily Bot** and we will tell you when HeyGen or Synthesia changes.',
    sources: [
      '[5] HeyGen pricing: https://www.heygen.com/pricing (vendor, checked Oct 17, 2026)',
      '[6] Synthesia pricing: https://www.synthesia.io/pricing (vendor, checked Oct 18, 2026)',
      catalogSource,
    ],
    ranking: { href: '/best/video', label: 'See the full Video ranking' },
  },
  {
    slug: 'descript-vs-runway',
    metaTitle: 'Descript vs Runway: Edit Your Video or Generate New Shots?',
    metaDescription:
      'Descript vs Runway: edit recorded video or generate new shots? Verdict, prices checked Oct 2026, and a table. Or get your pick in 30 seconds.',
    heading: 'Descript vs Runway',
    nameA: 'Descript',
    nameB: 'Runway',
    verdict:
      'They do different jobs. Pick **Descript** to edit recorded video and podcasts by editing the transcript. Pick **Runway** to generate new shots from prompts. It is our top pick for "make a video" (fit {{b:video}}).',
    pickAHeading: 'Pick Descript if…',
    pickBHeading: 'Pick Runway if…',
    pickA: [
      'You record talking-head video, podcasts or screen recordings and want to edit them like a doc',
      'You want filler-word removal, Studio Sound and voice clones',
      'You want a free plan to try text-based editing',
    ],
    pickB: [
      'You want to generate video or images from text or images',
      'You want many AI video models in one place (Gen-4.5 and others)',
      'You can work within a monthly credit budget',
    ],
    rows: [
      { label: 'Our rating', kind: 'rating', source: 'BestBotFor catalog' },
      { label: 'Fit: make a video', kind: 'fit', task: 'video', source: 'bestbotfor.com/best/video' },
      {
        label: 'Free plan',
        kind: 'text',
        a: 'Yes: 60 media minutes a month, 720p export',
        b: 'One-time 125 credits (do not renew)',
        source: '[7]; [8]',
      },
      {
        label: 'Paid from',
        kind: 'text',
        a: 'Hobbyist $16/mo billed yearly ($24 monthly)',
        b: 'Standard $12/mo billed yearly ($15 monthly), 625 credits/mo',
        source: '[7]; [8]',
      },
      {
        label: 'Next tier',
        kind: 'text',
        a: 'Creator $24/mo yearly ($35 monthly), 4K export',
        b: 'Pro $28/mo yearly ($35 monthly), 2,250 credits/mo',
        source: '[7]; [8]',
      },
      {
        label: 'How you pay',
        kind: 'text',
        a: 'Media hours + AI credits per month',
        b: 'Credits (Gen-4.5 uses 12 credits per second)',
        source: '[7]; [8]',
      },
      { label: 'Skill level', kind: 'text', a: 'Beginner', b: 'Intermediate', source: 'BestBotFor catalog' },
    ],
    secondaryNote: COMPARE_SECONDARY_NOTE,
    cta: 'New AI video models ship every few weeks. Get **The Daily Bot** for the ones worth trying, in a 5-minute read.',
    sources: [
      '[7] Descript pricing: https://www.descript.com/pricing (vendor, checked Oct 17, 2026)',
      '[8] Runway pricing: https://runwayml.com/pricing (vendor, checked Oct 17, 2026)',
      catalogSource,
    ],
    ranking: { href: '/best/video', label: 'See the full Video ranking' },
  },
  {
    slug: 'granola-vs-fathom',
    metaTitle: 'Granola vs Fathom: Which AI Meeting Notes App Fits You?',
    metaDescription:
      'Granola vs Fathom: bot-free notes or free unlimited recordings? Verdict, prices checked Oct 2026, and a table. Or get your pick in 30 seconds.',
    heading: 'Granola vs Fathom',
    nameA: 'Granola',
    nameB: 'Fathom',
    verdict:
      "Pick **Granola** if you don't want a bot joining your calls and mostly need clean notes. Pick **Fathom** if you want unlimited free recordings and clips, with history beyond 30 days on the free plan.",
    pickAHeading: 'Pick Granola if…',
    pickBHeading: 'Pick Fathom if…',
    pickA: [
      "You don't want a bot in the meeting (Granola captures device audio)",
      'You write rough notes and want AI to fill them in',
      'You can live with 30 days of history on free, or pay $14 per user',
    ],
    pickB: [
      'You want unlimited recordings and transcription free',
      'You want video clips and playlists of key moments',
      'You are solo now but may add a team (Team plan, 2-user minimum)',
    ],
    rows: [
      { label: 'Our rating', kind: 'rating', source: 'BestBotFor catalog' },
      { label: 'Fit: take meeting notes', kind: 'fit', task: 'meetings', source: 'bestbotfor.com/best/meetings' },
      {
        label: 'Free plan',
        kind: 'text',
        a: 'Basic: AI notes, 30-day meeting history',
        b: 'Free forever: unlimited recordings + transcription, instant AI summaries',
        source: '[9]; [10]',
      },
      {
        label: 'Paid from',
        kind: 'text',
        a: 'Business $14 per user/mo',
        b: 'Premium $16/mo billed yearly ($20 monthly)',
        source: '[9]; [10]',
      },
      {
        label: 'Teams',
        kind: 'text',
        a: 'Business $14/user; Enterprise $35/user',
        b: 'Team $15/user yearly ($19 monthly), 2-user minimum',
        source: '[9]; [10]',
      },
      {
        label: 'Bot in the call?',
        kind: 'text',
        a: 'No: bot-free device-audio capture',
        b: 'Your choice: bot, or bot-free (beta, Mac)',
        source: '[9]; [10]',
      },
    ],
    secondaryNote: COMPARE_SECONDARY_NOTE,
    cta: 'Meeting-notes apps are adding features weekly. Get **The Daily Bot** and catch the changes that matter.',
    sources: [
      '[9] Granola pricing: https://www.granola.ai/pricing (vendor, checked Oct 17, 2026)',
      '[10] Fathom pricing: https://www.fathom.ai/pricing (vendor, checked Oct 17, 2026)',
      catalogSource,
    ],
    ranking: { href: '/best/meetings', label: 'See the full Meetings ranking' },
  },
  {
    slug: 'fathom-vs-fireflies',
    metaTitle: 'Fathom vs Fireflies: Which AI Notetaker Is Right for You?',
    metaDescription:
      'Fathom vs Fireflies: one-line verdict, prices checked Oct 2026, and a side-by-side table. Or get your own AI tool pick in 30 seconds.',
    heading: 'Fathom vs Fireflies',
    nameA: 'Fathom',
    nameB: 'Fireflies',
    verdict:
      'For most teams, pick **Fireflies**. It rates higher with us (#2 in Meetings), and Pro is $10 a seat billed yearly. Pick **Fathom** if you are a solo user who wants unlimited recordings and AI summaries for free.',
    pickAHeading: 'Pick Fathom if…',
    pickBHeading: 'Pick Fireflies if…',
    pickA: [
      'You are a solo user and want a strong free plan',
      'You want unlimited recordings plus instant summaries without paying',
      'You want clips and playlists of call highlights',
    ],
    pickB: [
      'You are a team that wants low per-seat pricing ($10/seat yearly on Pro)',
      'You record Zoom, Google Meet and Teams and want search across calls',
      'You want a free plan with unlimited transcription to start',
    ],
    rows: [
      { label: 'Our rating', kind: 'rating', source: 'BestBotFor catalog' },
      { label: 'Fit: take meeting notes', kind: 'fit', task: 'meetings', source: 'bestbotfor.com/best/meetings' },
      {
        label: 'Free plan',
        kind: 'text',
        a: 'Unlimited recordings + transcription, instant AI summaries',
        b: 'Free forever, unlimited transcription; AI summaries and storage limited',
        source: '[10]; [11]; catalog',
      },
      {
        label: 'Paid from',
        kind: 'text',
        a: 'Premium $16/mo billed yearly ($20 monthly)',
        b: 'Pro $10/seat/mo billed yearly ($18 monthly)',
        source: '[10]; [11]',
      },
      {
        label: 'Business tier',
        kind: 'text',
        a: '$25/user yearly ($34 monthly), 2-user minimum',
        b: '$19/seat yearly ($29 monthly)',
        source: '[10]; [11]',
      },
      {
        label: 'Enterprise',
        kind: 'text',
        a: 'Talk to sales',
        b: '$39/seat/mo, annual only',
        source: '[10]; [11]',
      },
    ],
    secondaryNote: COMPARE_SECONDARY_NOTE,
    cta: 'Prices on notetakers keep dropping. Get **The Daily Bot** to catch the next price cut.',
    sources: [
      '[10] Fathom pricing: https://www.fathom.ai/pricing (vendor, checked Oct 17, 2026)',
      '[11] Fireflies pricing (read from the page HTML; plan grid renders client-side): https://fireflies.ai/pricing (vendor, checked Oct 17, 2026)',
      catalogSource,
    ],
    ranking: { href: '/best/meetings', label: 'See the full Meetings ranking' },
  },
  {
    slug: 'lovable-vs-v0',
    metaTitle: 'Lovable vs v0: Which AI App Builder Is Right for You?',
    metaDescription:
      'Lovable vs v0: full app from a prompt, or polished UI code? Verdict, prices checked Oct 2026, and a table. Or get your pick in 30 seconds.',
    heading: 'Lovable vs v0',
    nameA: 'Lovable',
    nameB: 'v0',
    verdict:
      "Pick **Lovable** to go from a prompt to a working app with a built-in backend if you don't code. It is our #1 for building an app from a prompt (fit {{a:vibe-coding}}). Pick **v0** if you want polished front-end code that deploys to Vercel and you are comfortable in code.",
    pickAHeading: 'Pick Lovable if…',
    pickBHeading: 'Pick v0 if…',
    pickA: [
      'You are not a developer and want a full app (pages, login, database)',
      'You want backend and hosting built in (Lovable Cloud; free plan includes 20 Cloud credits a month per our catalog)',
      'You want to start free with daily build credits',
    ],
    pickB: [
      'You are a developer, or work with one, and want React/Next.js UI code',
      'You already deploy on Vercel and sync with GitHub',
      'You mainly need websites and interfaces (v0 fits "build a website" at {{b:websites}})',
    ],
    rows: [
      { label: 'Our rating', kind: 'rating', source: 'BestBotFor catalog' },
      { label: 'Fit: build an app from a prompt', kind: 'fit', task: 'vibe-coding', source: 'bestbotfor.com/best/vibe-coding' },
      { label: 'Fit: build a website', kind: 'fit', task: 'websites', source: 'bestbotfor.com/best/websites' },
      {
        label: 'Free plan',
        kind: 'text',
        a: '5 build credits a day, up to 30 a month',
        b: '7 messages a day; deploy to Vercel; GitHub sync',
        source: '[12]; [13]',
      },
      {
        label: 'Paid from',
        kind: 'text',
        a: 'Pro $25/mo (100 credits) or $21/mo billed yearly',
        b: 'Plus $30 (shown reduced from $90)',
        source: '[12a]; [13]',
      },
      {
        label: 'Business tier',
        kind: 'text',
        a: 'Business $50/mo, or $42/mo billed yearly',
        b: 'Business $100 per user/mo',
        source: '[12a]; [13]',
      },
      { label: 'Skill level', kind: 'text', a: 'Beginner', b: 'Intermediate', source: 'BestBotFor catalog' },
    ],
    secondaryNote: COMPARE_SECONDARY_NOTE,
    cta: 'Vibe-coding tools ship new models and plans constantly. Get **The Daily Bot** and keep up in one short read.',
    sources: [
      '[12] Lovable pricing FAQ: https://lovable.dev/pricing (vendor, checked Oct 18, 2026)',
      '[12a] Lovable subscription tiers (vendor docs): https://docs.lovable.dev/introduction/subscription-plans (vendor docs, checked Oct 18, 2026)',
      '[13] v0 pricing: https://v0.app/pricing (vendor, checked Oct 18, 2026)',
      catalogSource,
    ],
    ranking: { href: '/best/vibe-coding', label: 'See the full Build an app from a prompt ranking' },
  },
  {
    slug: 'assemblyai-vs-deepgram',
    metaTitle: 'AssemblyAI vs Deepgram: Which Speech-to-Text API Fits You?',
    metaDescription:
      'AssemblyAI vs Deepgram: speech-to-text API prices checked Oct 2026, free credits, and a side-by-side table. Or get your own AI pick in 30 seconds.',
    heading: 'AssemblyAI vs Deepgram',
    nameA: 'AssemblyAI',
    nameB: 'Deepgram',
    verdict:
      'Both are developer APIs, not apps. For batch transcription, **AssemblyAI** Universal-2 is cheaper per hour ($0.15 vs $0.26 for Deepgram Nova-3). **Deepgram** gives more free credit to start ($200 vs $50) and adds text-to-speech on the same platform.',
    pickAHeading: 'Pick AssemblyAI if…',
    pickBHeading: 'Pick Deepgram if…',
    pickA: [
      'You transcribe recorded audio in bulk and want the lowest per-hour rate ($0.15/hr on Universal-2)',
      'You want add-ons like PII redaction and speaker labels priced per hour',
      'You want an LLM gateway on the same API key',
    ],
    pickB: [
      'You want the biggest free credit to prototype ($200, no expiry date)',
      'You need streaming plus text-to-speech (Aura, Flux TTS) from one vendor',
      'You want true per-second billing',
    ],
    rows: [
      { label: 'Our rating', kind: 'rating', source: 'BestBotFor catalog' },
      {
        label: 'Free credit',
        kind: 'text',
        a: '$50, no card',
        b: '$200, no card',
        source: '[14]; [15]',
      },
      {
        label: 'Pre-recorded transcription',
        kind: 'text',
        a: 'Universal-3.5 Pro $0.21/hr; Universal-2 $0.15/hr',
        b: 'Nova-3 $0.26/hr ($0.0043/min)',
        source: '[14]; [15]',
      },
      {
        label: 'Streaming',
        kind: 'text',
        a: 'From $0.15/hr (billed on session time)',
        b: 'Nova-3 $0.29/hr ($0.0048/min, promotional)',
        source: '[14]; [15]',
      },
      {
        label: 'Voice agent API',
        kind: 'text',
        a: '$4.50/hr',
        b: '$4.50/hr (Standard)',
        source: '[14]; [15]',
      },
      {
        label: 'Text to speech',
        kind: 'text',
        a: 'Not listed',
        b: 'Yes: Aura-2 $0.030 per 1,000 characters',
        source: '[15]',
      },
      { label: 'Skill level', kind: 'skill', source: 'BestBotFor catalog' },
    ],
    secondaryNote: COMPARE_SECONDARY_NOTE,
    cta: 'Speech AI prices fell again this year. Get **The Daily Bot** for AI and API pricing changes.',
    sources: [
      '[14] AssemblyAI pricing: https://www.assemblyai.com/pricing (vendor, checked Oct 17, 2026 (page says last updated Sep 28, 2026))',
      '[15] Deepgram pricing: https://deepgram.com/pricing (vendor, checked Oct 17, 2026)',
      catalogSource,
    ],
    ranking: { href: '/best/voice', label: 'See the full Voice ranking' },
  },
]

export const compareCopy: readonly CompareCopy[] = compareCopyDraft.map((entry) => ({
  ...entry,
  checkedLine: comparePageCheckedLine(entry.sources),
}))

const bySlug = new Map(compareCopy.map((entry) => [entry.slug, entry]))

export function compareCopyFor(slug: string): CompareCopy | undefined {
  return bySlug.get(slug)
}

/**
 * Curated copy exists for one order only. The reverse URL permanently
 * redirects there so it does not publish a generated verdict and its own canonical.
 */
export function reversedCuratedComparePath(pair: string): string | null {
  const [left, right, extra] = pair.split('-vs-')
  if (!left || !right || extra !== undefined || left === right) return null
  if (bySlug.has(pair)) return null
  const canonical = bySlug.get(`${right}-vs-${left}`)
  return canonical ? `/compare/${canonical.slug}` : null
}

export function curatedCompareRedirects(): { source: string; destination: string; permanent: true }[] {
  return compareCopy.map((entry) => {
    const [left, right] = entry.slug.split('-vs-')
    return {
      source: `/compare/${right}-vs-${left}`,
      destination: `/compare/${entry.slug}`,
      permanent: true,
    }
  })
}
