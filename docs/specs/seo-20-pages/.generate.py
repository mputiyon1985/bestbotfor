import os
D=os.path.dirname(os.path.abspath(__file__))
pages=[]
def add(**k): pages.append(k)
# ---- P0: A2 compares (existing template, already live via PR #54) ----
A2=[('elevenlabs-vs-murf','ElevenLabs','Murf','voice','Studio Creator $29/mo, or $19/mo billed yearly [S] → Studio Creator $29/mo, or $19/mo billed yearly (drop [S] in Free and Paid-from rows; Murf Studio confirmed first-party Oct 18)'),
    ('n8n-vs-make','n8n','Make','automation','Core $9/mo billed yearly or $10.59 monthly (10,000 credits) [S] → Core $12/mo billed yearly or $16 monthly (10,000 credits). Also "1,000+ app integrations" → "3,500+ apps" (make.com Oct 18)'),
    ('heygen-vs-synthesia','HeyGen','Synthesia','video','No price change. Keep Synthesia Starter at $29/mo billed monthly (yearly price still contradictory on the vendor page)'),
    ('descript-vs-runway','Descript','Runway','video','No price change needed (not in the Oct 18 recheck scope)'),
    ('granola-vs-fathom','Granola','Fathom','meetings','No change'),
    ('fathom-vs-fireflies','Fathom','Fireflies','meetings','No change'),
    ('lovable-vs-v0','Lovable','v0','vibe-coding','From $30 per user/mo with $30 of included credits → Plus $30 per user/mo (shown as reduced from $90), with $30 of included credits; Lovable Business → $50/mo, or $42/mo billed yearly; Lovable source → lovable.dev/pricing'),
    ('assemblyai-vs-deepgram','AssemblyAI','Deepgram','voice','No change'),]
for i,(slug,a,b,task,fix) in enumerate(A2,1):
    add(n=i,file=f'{i:02d}-compare-{slug}.md',url=f'/compare/{slug}',prio='P0: fix now (live)',template='EXISTING: src/app/compare/[pair]/page.tsx + src/data/compare-copy.ts',
        new=False,overlap='YES: shipped in PR #54 (9bd4b8b, Oct 17) and in comparePairSeeds + sitemap',family='"A vs B" (3.9, P1)',
        phrases=f'{a.lower()} vs {b.lower()} · {a.lower()} or {b.lower()} · is {a.lower()} better than {b.lower()}',
        title='(unchanged; live from compare-copy.ts)',meta='(unchanged; live from compare-copy.ts)',h1=f'{a} vs {b}',
        outline=['No new page. Only edit `src/data/compare-copy.ts` per a2-compare-copy/price-recheck-2026-10-18.md:',fix,
                 f'Add internal link: a "Best AI tool for {task}" link to /best/{task} under the table (anchor text from 3.9)'],
        data='src/data/compare-copy.ts (curated) + catalog fit scores at render time; prices: vendor pages checked Oct 17–18',
        links_in=[f'/best/{task} (new "Compare the top picks" block, see page 11+ notes)',f'/tools/{slug.split("-vs-")[0]} and /tools/{slug.split("-vs-")[1]} (existing compare links on tool pages)','sitemap (already)'],
        links_out=[f'/best/{task}','both /tools profiles (existing)','/newsletter form (existing CompareNewsletter)'])
# ---- P1: lead magnet + guide ----
add(n=9,file='09-ai-loadout.md',url='/ai-loadout',prio='P1',template='NEW (simple static page; reuse NewsletterForm + Breadcrumbs + JsonLd)',new=True,overlap='No',
    family='"Best AI tool for X" (3.9, P1), list intent; lead capture',phrases='best AI tool for every job · best AI tools list 2026 · AI tools cheat sheet',
    title='The AI Loadout: The Best AI Tool for All 17 Jobs',meta='One top pick for each of 17 jobs, from writing code to making music, from our catalog of 159 tools. Free one-page PDF. The right AI in 30 seconds.',
    h1='The AI Loadout: the best bot for all 17 jobs',
    outline=['Intro (2 sentences): what it is, picks are editorial, dated','The 17 picks as an HTML table rendered LIVE from the catalog (task → top pick → fit → why → link to /best/[task]); do not hard-code the Oct 17 snapshot',
             'Email capture: "Get the PDF + The Daily Bot" (NewsletterForm, source=ai-loadout); after submit show the PDF link','Direct PDF link also visible (no gating that blocks crawlers or users)','"Not sure which job is yours? Answer 3 questions" → /','Disclosure line: "Payment never buys a higher rank."'],
    data='listPublicSlugs() tasks + top pick per task (same ranking as /best/[task]); PDF asset: marketing/a3-lead-magnet/ai-loadout.pdf → public/ai-loadout.pdf (regenerate when picks change)',
    links_in=['Homepage (footer or below picker)','/newsletter page','each /best/[task] (small "Get the AI Loadout" link)','Beehiiv welcome email','social posts'],links_out=['all 17 /best/[task]','/','/newsletter'])
add(n=10,file='10-guide-how-to-choose-an-ai-tool.md',url='/guides/how-to-choose-an-ai-tool',prio='P1',template='NEW route group /guides/[slug] (static MDX or TSX content page; can copy the how-we-rate page layout)',new=True,overlap='No',
    family='"Right AI / choosing" (3.9, P2) + "Which AI should I use" (P1)',phrases='how to choose an AI tool · choosing the right AI tool · which AI should I use · right AI tool for [job]',
    title='How to Choose an AI Tool: 3 Questions That Decide It',meta='How to choose the right AI tool: the job, your budget and your experience. A plain-English method, plus the best pick for 17 jobs. Takes 30 seconds.',
    h1='How to choose an AI tool',
    outline=['Answer first (40–60 words): "Start with the job, then your budget, then your experience." (snippet target)','H2 Question 1: What do you want to do? (link the 17 jobs)','H2 Question 2: What can you spend? (Free only / Low cost / Any budget, what each means)',
             'H2 Question 3: How experienced are you? (Beginner / Intermediate / Advanced)','H2 How we score fit (summary, link /how-we-rate)','H2 Common mistakes (picking the most famous tool; paying before testing a free tier)','CTA: "Get your pick in 30 seconds" → /','FAQ (3 Qs) with FAQPage JSON-LD'],
    data='Static copy (Nova) + task list from catalog; facts: 159 tools, 17 jobs, one pick + up to six alternatives',
    links_in=['Homepage "How it works" section','every /best/[task] (one line: "New to this? How to choose an AI tool")','/about','/how-we-rate'],links_out=['/','all 17 /best/[task]','/how-we-rate','/tools'])
# ---- P2: alternatives ----
ALT=[('chatgpt','ChatGPT','chat','Chat and brainstorm','Claude, Gemini, Perplexity'),('midjourney','Midjourney','images','Generate images','Krea, Leonardo AI, Ideogram'),
     ('zapier','Zapier','automation','Automate a workflow','Make, n8n'),('cursor','Cursor','coding','Write code','Claude Code, GitHub Copilot, Windsurf'),
     ('elevenlabs','ElevenLabs','voice','Create a voiceover','Murf, WellSaid')]
for j,(slug,name,task,tname,examples) in enumerate(ALT,11):
    t=f'{name} Alternatives: The Best Picks by Budget (2026)'
    if len(t)>60: t=f'{name} Alternatives: Best Picks by Budget'
    m=f'The best {name} alternatives for {tname.lower()}, ranked by fit and filtered by budget and experience. Free options included. Or get your pick in 30 seconds.'
    if len(m)>155: m=f'The best {name} alternatives, ranked by fit and filtered by budget and experience. Free options included. Or get your pick in 30 seconds.'
    add(n=j,file=f'{j:02d}-alternatives-{slug}.md',url=f'/alternatives/{slug}',prio='P2',template='NEW route /alternatives/[tool] (one template for all; reuse ToolLogo, OutboundLink, Breadcrumbs, ItemList JSON-LD)',new=True,overlap='Partial: links to existing compares where a pair exists',
        family='"[tool] alternatives" (marketing-plan 3.x, "Alternatives pages (phase 2)"); supports "Best AI tool for X"',phrases=f'{name.lower()} alternatives · apps like {name.lower()} · {name.lower()} alternative free · best {name.lower()} alternative',
        title=t,meta=m,h1=f'{name} alternatives',
        outline=[f'Answer first: "The closest {name} alternative is [#1 non-{name} tool by fit]," from live data',f'Ranked list (up to 6): tools that fit {task} (fit ≥ 50), excluding {name}; per row: fit %, price label, skill level, one-line why, pros/cons (catalog), link to /tools/[slug] (today this would include e.g. {examples}; rendered live, not hard-coded)',
                 'Filter chips: Free only / Low cost (reuse budget logic from listMatches)',f'"Compare head to head" links to any comparePairSeeds pair that includes {name}',f'"Why people switch from {name}" (2–3 bullets from the catalog cons, factual only)','CTA: answer 3 questions → /','Disclosure line; no Sponsored card on this template in v1'],
        data=f'Catalog fits for task "{task}" (src/data/catalog.ts toolSeeds + scores-v2.3.csv + scores-pros-cons.csv); same ranking as listMatches(tools, budget); {name} profile cons for the "why switch" bullets',
        links_in=[f'/tools/{slug} (new "Alternatives to {name}" link)',f'/best/{task}','related /compare pages','sitemap'],links_out=[f'/tools/{slug}',f'/best/{task}','/tools/[each alternative]','/compare pairs','/'])
# ---- P3: best free ----
FREE=[('coding','Write code','writing code',20,'Cursor, Cline, GitHub Copilot'),('images','Generate images','generating images',14,'Krea, Leonardo AI, Ideogram'),
      ('video','Make a video','making a video',17,'Synthesia, HeyGen, OpusClip'),('voice','Create a voiceover','creating a voiceover',16,'ElevenLabs, Murf, Fish Audio'),
      ('meetings','Take meeting notes','taking meeting notes',9,'Otter.ai, Fireflies, Fathom')]
for k,(slug,tname,phrase,cnt,top) in enumerate(FREE,16):
    t=f'Best Free AI Tool for {tname.title()} (2026)'
    add(n=k,file=f'{k:02d}-best-{slug}-free.md',url=f'/best/{slug}/free',prio='P3 (needs a Forge decision on indexing first)',template='NEW nested route src/app/best/[task]/free/page.tsx (reuses the /best/[task] layout + listMatches(tools, "free"))',new=True,
        overlap=f'Overlaps /result?task={slug}&view=all&budget=free, which is noindex by design (src/lib/result-index.ts: "Budget filters repeat the unfiltered list")',
        family='"Best AI tool for X" (3.9, P1), variant "best free AI for [task]"',phrases=f'best free AI for {phrase} · free AI {slug} tool · best free AI {slug} tool for beginners',
        title=t if len(t)<=60 else f'Best Free AI for {tname.title()}',meta=f'The best free AI tool for {phrase}, plus up to five free alternatives, with what each free plan includes. Checked against vendor pages.',
        h1=f'Best free AI tool for {phrase}',
        outline=[f'Answer first: "The best free AI tool for {phrase} is [top free pick]" (live; today: {top.split(",")[0]})',f'Ranked list of tools with a usable free plan ({cnt} qualify today per /result budget=free), top 6 shown',
                 '**Unique content that justifies indexing:** per tool, "What the free plan includes / limits" (e.g. credits, minutes, watermark, commercial use), from a new catalog field `freePlanNotes` with source URL + checked date',
                 f'"When to pay" note: the paid pick from /best/{slug} and what you get for the money','CTA: picker with Budget = Free only pre-selected','FAQ (2–3) + ItemList JSON-LD'],
        data=f'listMatches(tools, "free") for task {slug}; NEW field freePlanNotes per tool (Nova researches from vendor pages; Tony adds to catalog)',
        links_in=[f'/best/{slug} ("Only want free tools?" link)',f'/tools/[slug] for each listed tool','/guides/how-to-choose-an-ai-tool','sitemap (only if indexed)'],links_out=[f'/best/{slug}','/tools/[each]','/'])
def md(p):
    L=[f"# {p['url']}",f"**Priority:** {p['prio']} · **Template:** {p['template']} · **New template needed:** {'YES' if p['new'] else 'No'}",f"**Overlap with A2 / existing pages:** {p['overlap']}","",
       "## Target keywords",f"- **Family:** {p['family']}",f"- **Phrases (no volumes measured; validate in Search Console):** {p['phrases']}","",
       "## Head",f"- **Title** ({len(p['title']) if not p['title'].startswith('(') else '—'} chars): `{p['title']}`",f"- **Meta description** ({len(p['meta']) if not p['meta'].startswith('(') else '—'} chars): `{p['meta']}`",f"- **H1:** {p['h1']}",
       f"- **Canonical:** https://bestbotfor.com{p['url']} · robots: " + ("index, follow ONLY after the Forge decision; otherwise noindex" if p["prio"].startswith("P3") else "index, follow"),"","## Outline"]+[f"{i}. {o}" for i,o in enumerate(p['outline'],1)]+["",
       "## Data source",p['data'],"","## Internal links","**In (pages that should link here):**"]+[f"- {x}" for x in p['links_in']]+["**Out (this page links to):**"]+[f"- {x}" for x in p['links_out']]+["",
       "## Acceptance","- Facts render from live catalog data, never typed by hand (except the static guide copy).","- Title ≤ 60 chars, meta ≤ 155. One H1. Breadcrumbs + JSON-LD.","- Newsletter form present (existing component). No Sponsored card unless the page type is approved for one.","- Never use \"best\", \"top\" or \"recommended\" in any sponsor copy (Forge rule)."]
    return '\n'.join(L)+'\n'
for p in pages:
    if not p['title'].startswith('('): assert len(p['title'])<=60,(p['file'],len(p['title']))
    if not p['meta'].startswith('('): assert len(p['meta'])<=155,(p['file'],len(p['meta']),p['meta'])
    open(os.path.join(D,p['file']),'w').write(md(p))
print(len(pages))
