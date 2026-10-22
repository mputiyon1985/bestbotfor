import type { FreePlanFields } from '@/lib/catalog-types'

/**
 * Free-plan catalog fields (freePlanNote, freePlanSource, freePlanCheckedAt),
 * written by Forge from each vendor's own pricing or plan page.
 * Source data: docs/specs/free-plan-notes/free-plan-notes.by-tool.csv (63 of 68 verified, checked 2026-10-18 ET).
 * Do not edit a note without re-checking the vendor page and moving the date.
 * Catalog data only, so there is no database migration.
 */
export const freePlanNotes: Readonly<Record<string, FreePlanFields>> = {
  "cursor": {
    freePlanNote: "Cursor's Free plan ($0/month) includes the Cursor agent with limited agent and chat requests. Cloud agents, automations and code hosting start on the $30/month Premium plan.",
    freePlanSource: "https://cursor.com/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "cline": {
    freePlanNote: "Cline is free and open source for individual developers (VS Code extension and CLI), with MCP Marketplace access and community support. You pay only for AI inference, at cost through Cline or with your own API key.",
    freePlanSource: "https://cline.bot/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "github-copilot": {
    freePlanNote: "Copilot Free ($0) includes 2,000 inline code suggestions a month and limited chat and agent usage, and it supports agent mode and the Copilot CLI. Paid plans start at Pro, $10/month, with unlimited suggestions.",
    freePlanSource: "https://github.com/features/copilot/plans",
    freePlanCheckedAt: "2026-10-18",
  },
  "claude": {
    freePlanNote: "Claude's Free plan ($0) covers chat on web, desktop and mobile, web search, file creation, code execution, memory, app connectors and Artifacts. Usage is lower than Pro ($17/month billed yearly, $20 monthly).",
    freePlanSource: "https://claude.com/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "openai-codex": {
    freePlanNote: "Codex comes with ChatGPT Free ($0) for quick coding tasks, using GPT-6 Luna at Standard speed in the desktop app (subject to rollout). Codex on the web, CLI, IDE extension and iOS, plus automatic code review, starts with Plus at $20/month.",
    freePlanSource: "https://developers.openai.com/codex/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "windsurf": {
    freePlanNote: "Devin Desktop (formerly Windsurf) Free ($0) gives a light agent quota with limited model availability, plus unlimited inline edits and Tab completions. Pro ($20/month) adds full model access and higher quotas.",
    freePlanSource: "https://devin.ai/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "chatgpt": {
    freePlanNote: "ChatGPT Free includes unlimited everyday text chats with GPT-6 (subject to abuse guardrails) and a 27K context window. Uploads, image creation, voice, deep research, memory and Codex are all limited.",
    freePlanSource: "https://chatgpt.com/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "google-antigravity": {
    freePlanNote: "Antigravity's individual plan is $0/month, with access to a variety of agent models, unlimited Tab completions and unlimited Command requests, under basic weekly rate limits. Google AI plans raise those limits.",
    freePlanSource: "https://antigravity.google/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "kiro": {
    freePlanNote: "Kiro Free ($0/month) includes 50 credits a month with access to open-weight models and Claude Sonnet 4.5, with limits. Add-on credits require a paid plan (Pro from $20/month).",
    freePlanSource: "https://kiro.dev/pricing/",
    freePlanCheckedAt: "2026-10-18",
  },
  "replit": {
    freePlanNote: "Replit's Starter plan is free, with daily Agent credits up to a monthly cap, monthly cloud credits, Lite build and one published app. That app goes offline after 30 days and shows a 'Made with Replit' badge. Full build, connectors and Plan Mode need Core.",
    freePlanSource: "https://docs.replit.com/billing/plans",
    freePlanCheckedAt: "2026-10-18",
  },
  "zed": {
    freePlanNote: "Zed Personal is $0, free forever, and gives unlimited use with your own API keys or external agents such as Claude Agent and Codex CLI. Zed's own hosted AI (edit predictions and included tokens) is on Pro at $10/month.",
    freePlanSource: "https://zed.dev/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "kilo-code": {
    freePlanNote: "Kilo Code is free and open source as VS Code, JetBrains and CLI extensions, works with any AI model, and includes agentic coding and code completion. Model usage is billed separately.",
    freePlanSource: "https://kilo.ai/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "google-ai-studio": {
    freePlanNote: "The Gemini API Free tier includes Google AI Studio access and free input and output tokens, with limited access to certain models. On the Free tier, content may be used to improve Google's products; higher rate limits need the paid tier.",
    freePlanSource: "https://ai.google.dev/gemini-api/docs/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "amazon-q-developer": {
    freePlanNote: "Amazon Q Developer Free Tier includes 50 agentic requests (chat and agentic coding) a month in the IDE and CLI, plus 1,000 lines of code a month for Java upgrade transformations. Pro is $19/user/month.",
    freePlanSource: "https://aws.amazon.com/q/developer/pricing/",
    freePlanCheckedAt: "2026-10-18",
  },
  "jules": {
    freePlanNote: "The free Jules plan allows 15 tasks per rolling 24 hours and 3 concurrent tasks on Gemini 2.5 Pro. Higher limits come through Google AI Pro or Ultra subscriptions.",
    freePlanSource: "https://jules.google/docs/usage-limits",
    freePlanCheckedAt: "2026-10-18",
  },
  "trae": {
    freePlanNote: "Trae Free ($0) is Auto mode only, with limited usage and limited autocomplete. Pro ($20/month) adds all models, $20 of usage a month and unlimited autocomplete.",
    freePlanSource: "https://www.trae.ai/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "warp": {
    freePlanNote: "Warp Free ($0/month) includes the core terminal, Warp Agent CLI access, bring-your-own AI inference and limited cloud agent access. Extra agent usage is pay-as-you-go.",
    freePlanSource: "https://www.warp.dev/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "gemini": {
    freePlanNote: "Gemini's Free plan (US) includes the Gemini app on the Flash-Lite model, image generation and editing, Deep Research, Gemini Live, Canvas and Gems, plus limited Nano Banana Pro in Google Flow and 15 GB of storage. Paid Google AI plans raise usage limits.",
    freePlanSource: "https://gemini.google/subscriptions/",
    freePlanCheckedAt: "2026-10-18",
  },
  "opencode": {
    freePlanNote: "OpenCode is an open-source AI coding agent for the terminal, IDE and desktop. It includes free models, or you can connect any model provider, including Claude, GPT and Gemini.",
    freePlanSource: "https://opencode.ai/",
    freePlanCheckedAt: "2026-10-18",
  },
  "tabby": {
    freePlanNote: "Tabby Community is free and open source for up to 5 users with local (self-hosted) deployment. It includes code completion, the Answer Engine, in-line chat and Context Provider; Team is $19/seat/month.",
    freePlanSource: "https://www.tabbyml.com/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "krea": {
    freePlanNote: "Krea Free ($0, no credit card) gives 100 compute units a day across its image, video, 3D and lipsync models, plus real-time generation, limited LoRA training (up to 50 images) and upscaling to 2K. The newest in-house model, Krea 3, is not included.",
    freePlanSource: "https://www.krea.ai/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "leonardo-ai": {
    freePlanNote: "Leonardo's Free plan ($0) gives 150 fast tokens a day with no rollover. Generations are public, and Ultra Quality, Realtime Canvas, Elements and collections are limited. Free users get a non-exclusive, royalty-free license to use their images commercially, but Leonardo holds rights to them as well.",
    freePlanSource: "https://leonardo.ai/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "ideogram": {
    freePlanNote: "Ideogram has no free subscription plan, but eligible free accounts receive weekly credits when signing in with Google, Apple or Microsoft (the amount varies). Free-account images are published to the community by default, and private generation starts with Plus ($15/month billed yearly).",
    freePlanSource: "https://ideogram.ai/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "playground": {
    freePlanNote: "Playground Free creates up to 10 images every 3 hours, plus 3 monthly generations on premium models (Nano Banana, GPT Image 2/2.5, Seedream), and includes a worldwide royalty-free commercial license. Generation slows at peak hours, with a wait after limits are reached.",
    freePlanSource: "https://playground.com/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "recraft": {
    freePlanNote: "Recraft has a Free plan, but images made on it are owned by Recraft, shown publicly in the community gallery and not licensed for commercial use. Paid plans give private images and full commercial rights.",
    freePlanSource: "https://www.recraft.ai/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "canva": {
    freePlanNote: "Canva Free includes the drag-and-drop editor with 1,000+ design types, 1.6M+ templates, 4.7M+ photos, videos, graphics and audio, one Brand Kit (3 colors), 5GB of storage and up to 20 Standard or Premium AI uses. Pro and higher get 10-20x more AI.",
    freePlanSource: "https://www.canva.com/pricing/",
    freePlanCheckedAt: "2026-10-18",
  },
  "clipdrop": {
    freePlanNote: "Clipdrop Free ($0) includes text-to-image and uncrop, plus 20 uses per 24 hours each of background removal, 2x upscaling, cleanup and relight, and 50 text removals. Pro raises these to 1,000 per 24 hours at high resolution, with up to 16x upscaling.",
    freePlanSource: "https://clipdrop.co/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "kittl": {
    freePlanNote: "Kittl's free plan gives a hand-picked selection of templates and tools and lets you preview most Pro features with light usage limits. It is for personal use only, with no commercial rights.",
    freePlanSource: "https://www.kittl.com/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "letsenhance": {
    freePlanNote: "Let's Enhance gives 10 free credits when you sign up, with no credit card needed. Free upscales go up to 8 megapixels from inputs of up to 24 MP or 50MB, carry a watermark, and are stored for 6 months.",
    freePlanSource: "https://letsenhance.io/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "scenario": {
    freePlanNote: "Scenario's free tier gives 50 free daily credits to try every model, with no credit card required. Free outputs are for personal and evaluation use only; commercial licensing starts with the $15/month Starter plan.",
    freePlanSource: "https://www.scenario.com/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "comfyui": {
    freePlanNote: "ComfyUI Desktop is free forever and open source, runs on your own hardware (offline after setup) and has no feature gates. Comfy Cloud gives new users 5 free GPU runs and free Comfy Agent credits; paid cloud plans start at $20/month.",
    freePlanSource: "https://www.comfy.org/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "runway": {
    freePlanNote: "Runway Free ($0) gives 125 one-time credits (they do not renew), a selection of generative models to test concepts, and 5GB of asset storage. Standard ($12/month billed yearly) adds 625 monthly credits and access to all models.",
    freePlanSource: "https://runwayml.com/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "synthesia": {
    freePlanNote: "Synthesia Basic ($0/month) includes 10 minutes of video creation or dubbing and 500 credits a month, 3 survey responses, share links, and prebuilt templates and libraries. Videos carry a Synthesia watermark.",
    freePlanSource: "https://www.synthesia.io/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "heygen": {
    freePlanNote: "HeyGen Free ($0/month) makes 3 videos a month, each up to 1 minute, with access to Avatar IV, 500+ stock avatars, 1 custom video avatar and 30+ languages at standard processing speed. Creator is $29/month.",
    freePlanSource: "https://www.heygen.com/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "opus-clip": {
    freePlanNote: "OpusClip Free ($0) gives 60 credits a month for AI clipping, auto reframe and AI captions, with clips rendered up to 1080p. Clips carry a watermark, the editor is not included, and clips stop being exportable after 3 days.",
    freePlanSource: "https://www.opus.pro/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "descript": {
    freePlanNote: "Descript Free ($0) includes 60 media minutes a month, 100 one-time AI credits, transcription in 25 languages, unlimited projects and dynamic captions. Paid plans (from Hobbyist) add monthly AI credits and watermark-free exports.",
    freePlanSource: "https://www.descript.com/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "colossyan": {
    freePlanNote: "Colossyan's Starter plan is free (no credit card) and includes 20 minutes a month of video with the NEO model, access to the avatar library, 15 custom avatars and 3 voices, 10 interactive videos and 15 auto translations a month. Professional is $59/month billed yearly.",
    freePlanSource: "https://www.colossyan.com/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "captions": {
    freePlanNote: "The free Captions plan includes the traditional editing tools (teleprompter, trim, zoom, sound effects, transitions, resizing) and captions in 100+ languages with 1 caption template. It includes no AI usage credits; AI generation needs Max or Frontier. Prices on the page are for iOS.",
    freePlanSource: "https://www.captions.ai/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "kapwing": {
    freePlanNote: "Kapwing Free ($0) gives 10 credits, unlimited watermarked exports up to 4 minutes long at 720p, and 5GB of storage. Credits cover auto-subtitling (up to 10 minutes) and text to speech (up to 1 minute).",
    freePlanSource: "https://www.kapwing.com/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "veed": {
    freePlanNote: "VEED has a free plan for essential editing that needs no credit card. Videos made on it show a VEED watermark in the corner, which any paid plan removes.",
    freePlanSource: "https://www.veed.io/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "fliki": {
    freePlanNote: "Fliki Free is free forever (no credit card) with 3 credits a month, 300 voices in 80+ languages, idea/script/blog/PPT-to-video, stock media and AI images. Exports are 720p and include a Fliki watermark.",
    freePlanSource: "https://fliki.ai/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "vidnoz": {
    freePlanNote: "Vidnoz Free ($0) includes daily video-creation credits, videos up to 3 minutes, 1,800+ AI avatars, 3,200+ templates and 890 voices, with 720p export at standard processing speed.",
    freePlanSource: "https://www.vidnoz.com/pricing.html",
    freePlanCheckedAt: "2026-10-18",
  },
  "elevenlabs": {
    freePlanNote: "ElevenLabs Free ($0/month) gives 10k credits a month across text to speech, speech to text, sound effects, voice design and music, with 3 Studio projects. The commercial license and instant voice cloning start on the Starter plan.",
    freePlanSource: "https://elevenlabs.io/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "murf": {
    freePlanNote: "Murf's free offer is $10 of API credit across 150+ voices in 35+ languages with 5 concurrent requests. After that it is pay-as-you-go, with text to speech from $0.01 per 1,000 characters.",
    freePlanSource: "https://murf.ai/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "fish-audio": {
    freePlanNote: "Fish Audio's Free Tier ($0, no credit card) gives 8,000 credits a month, up to 7 minutes of generation, 500 characters per generation, 3 public voice slots and standard speed. It does not include enhanced voice cloning or commercial use.",
    freePlanSource: "https://fish.audio/plan/",
    freePlanCheckedAt: "2026-10-18",
  },
  "speechify": {
    freePlanNote: "Speechify's Free plan is text-to-speech listening only, with 10 robotic-sounding voices at up to 1.5x speed. The natural voices (1,000+ in 60+ languages) are on Premium at $29/month.",
    freePlanSource: "https://speechify.com/pricing/",
    freePlanCheckedAt: "2026-10-18",
  },
  "podcastle": {
    freePlanNote: "Podcastle's pricing now lives on async.com. The Free plan includes 1 hour of media upload to the AI chat editor and 10 AI credits, both lifetime (one-time) amounts; paid plans add hundreds of credits a month.",
    freePlanSource: "https://async.com/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "voicemaker": {
    freePlanNote: "Voicemaker Free ($0, forever) has limited generations, up to 250 characters per conversion and limited voice library access. Starter ($5/month) raises this to 200,000 credits a month and 3,000 characters per conversion.",
    freePlanSource: "https://voicemaker.in/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "listnr": {
    freePlanNote: "Listnr Free ($0, no credit card) gives 1,000 credits to start, previews of 1,000+ AI voices in 142+ languages and accents, and Listnr Studio access. Individual ($19/month) adds 20,000 credits a month.",
    freePlanSource: "https://listnr.ai/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "lalal-ai": {
    freePlanNote: "LALAL.AI's Starter plan is always free, with 10 processing minutes in the Relaxed Queue, no Fast Queue minutes and a 200MB per-file upload limit. Lite starts at $7.50/month billed annually.",
    freePlanSource: "https://www.lalal.ai/pricing/",
    freePlanCheckedAt: "2026-10-18",
  },
  "typecast": {
    freePlanNote: "Typecast Free ($0/month) includes unlimited voice generation and playback, 3,000 lifetime download credits (about 5 minutes), HD 720p video exports and 1GB of storage. Attribution is required for everything downloaded on the Free plan.",
    freePlanSource: "https://typecast.ai/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "wondercraft": {
    freePlanNote: "Wondercraft Free ($0/month) gives 150 credits to try it, limited access to AI models, all video editing tools and exports up to 720p. Creator is $25/month.",
    freePlanSource: "https://www.wondercraft.ai/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "cartesia": {
    freePlanNote: "Cartesia Free ($0/month) gives 20K credits a month for text to speech and speech to text, plus $1 of prepaid agent usage. The commercial use license and instant voice cloning start on Pro ($5/month).",
    freePlanSource: "https://cartesia.ai/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "assemblyai": {
    freePlanNote: "AssemblyAI has a free tier with no credit card that covers up to 185 hours of pre-recorded and up to 333 hours of streaming transcription, with up to 5 new streaming connections per minute. After that, usage is pay-as-you-go.",
    freePlanSource: "https://www.assemblyai.com/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "inworld": {
    freePlanNote: "Inworld's On-Demand plan has no monthly fee (pay as you go) and lists up to 70 minutes of TTS included, 100 custom voices, 2 professional voice clones and a commercial license. Beyond that, TTS-2 is billed at $25 per 1M characters.",
    freePlanSource: "https://inworld.ai/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "otter": {
    freePlanNote: "Otter Basic is free, with 300 transcription minutes a month, live transcription, speaker identification, AI chat and the Zoom, Teams and Google Meet integrations. It is limited to 3 lifetime audio/video file imports. Pro is $16.99/user/month.",
    freePlanSource: "https://otter.ai/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "fireflies": {
    freePlanNote: "Fireflies Free ($0, free forever) includes unlimited transcription (the page footnotes this claim), limited AI summaries, 20 AI credits and 400 minutes of storage per team. It works with Zoom, Google Meet and Teams and transcribes 100+ languages.",
    freePlanSource: "https://fireflies.ai/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "fathom": {
    freePlanNote: "Fathom's Free plan is free forever, with unlimited recordings, instant call summaries and integrations with LLMs. Team plans start at $15/user/month billed yearly ($19 monthly), with a 2-user minimum.",
    freePlanSource: "https://www.fathom.ai/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "granola": {
    freePlanNote: "Granola Basic ($0/user/month) includes AI meeting notes, AI chat across meetings, shared folders, custom note templates and multi-language support, but only limited meeting history. Unlimited notes and history start on Business at $14/user/month.",
    freePlanSource: "https://www.granola.ai/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "twinmind": {
    freePlanNote: "TwinMind Free ($0, free forever) includes unlimited summaries and AI chats, unlimited transcription and capture hours, and daily and weekly digests. Pro is $11.99/month.",
    freePlanSource: "https://twinmind.com/pricing",
    freePlanCheckedAt: "2026-10-22",
  },
  "read-ai": {
    freePlanNote: "Read AI Free ($0, no credit card) includes 5 meeting transcripts a month with summaries, unlimited search, a personal meeting coach, basic integrations and 20+ languages. It is always free.",
    freePlanSource: "https://www.read.ai/plans-pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "notta": {
    freePlanNote: "Notta Free ($0, no credit card) gives 1 seat with 120 transcription minutes a month, up to 3 minutes per conversation, 50 file uploads and 10 AI summaries a month. It can transcribe web meetings with speaker identification.",
    freePlanSource: "https://www.notta.ai/en/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "notion-ai": {
    freePlanNote: "Notion's Free plan ($0) includes only a trial of Notion AI (for example generating docs or autofilling databases), plus databases, basic forms and sites, and Notion Calendar. The $10/month Plus plan also lists only a trial of Notion AI.",
    freePlanSource: "https://www.notion.com/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
  "reclaim": {
    freePlanNote: "Reclaim's Lite plan is free forever and includes 5 AI scheduling agents (Focus Time, Habits, Buffer Time, Smart Meetings, Meeting Quality) and task recommendations from meeting action items. It is limited to 1 user, a 1-week scheduling range, 1 calendar sync, 1 scheduling link and limited integrations (Google Tasks, Slack, Zoom, Meet).",
    freePlanSource: "https://reclaim.ai/pricing",
    freePlanCheckedAt: "2026-10-18",
  },
}

/**
 * Tools Forge could not verify from the official page. They stay off every
 * /best/[task]/free page until someone re-checks them. hasFreeTier is unchanged.
 */
export const freePlanHolds: Readonly<Record<string, string>> = {
  "picsart": "Official pricing page lists only Pro and Ultra; no free-plan terms published there.",
  "hedra": "Pricing page renders client-side only; no free-plan terms readable from the official page.",
}

/**
 * Vendor domains that are official for a tool but are not its catalog URL's
 * domain. Reviewed by hand. A source on any other domain does not count.
 */
export const freePlanOfficialDomains: Readonly<Record<string, readonly string[]>> = {
  // Anthropic publishes Claude pricing on claude.com; the app is claude.ai.
  claude: ['claude.com'],
  // Google's Gemini API pricing lives in the ai.google.dev docs.
  'google-ai-studio': ['google.dev'],
  // Gemini's consumer plans page.
  gemini: ['gemini.google'],
  // kilocode.ai now redirects to kilo.ai (catalog URL fix is a separate PR).
  'kilo-code': ['kilo.ai'],
  // podcastle.ai now redirects to async.com, branded Async (catalog fix is a separate PR).
  podcastle: ['async.com'],
  // playground.com 301-redirects to playgroundai.com (checked live Oct 18, 2026). The note was read on
  // playground.com and the catalog moves to playgroundai.com in the catalog patch, so allow both.
  playground: ['playground.com', 'playgroundai.com'],
  // runwayml.com redirects to runway.com. The note cites runwayml.com and the catalog patch moves to runway.com.
  runway: ['runwayml.com', 'runway.com'],
}
