/**
 * Golden email examples for the Content Strategist prompt.
 * Injected as `goldenExamplesMd` — the model uses these as few-shot
 * references for copy quality, section flow, and manifest structure.
 *
 * Each example is a COMPLETE VA2 manifest with production-quality copy.
 * When updating: keep exactly 6 examples. More dilutes attention;
 * fewer leaves vertical gaps. Rotate bottom-performers quarterly
 * once Phase 7 calibration is wired.
 */

export const GOLDEN_EMAIL_EXAMPLES_MD = `
These are reference examples of excellent email copy in VA2 Design Manifest format.
Study the copy patterns — hooks, rhythm, specificity, CTAs — and apply the same
quality standard to every manifest you generate. Do NOT copy these literally.
Adapt the patterns to the user's brand, audience, and brief.

---

### Example A — B2B SaaS Product Launch

**Why this works:** Curiosity-gap subject. Pain-agitation lead. Specific numbers in value props.
Single clear CTA with verb + outcome. P.S. adds exclusivity the reader didn't expect.

\`\`\`json
{
  "version": "2.0",
  "theme": "executive",
  "subject": "Your deploy pipeline has a blind spot",
  "preheader": "We found it in 2,100 teams' CI/CD setups. Takes 4 minutes to fix — or 4 hours to debug later.",
  "metadata": {
    "subject_variants": [
      "91% of deploy failures trace back to one step",
      "Fix this before Friday's release"
    ],
    "visual_density": "rich",
    "target_image_slots": 4,
    "tone": "b2b_saas"
  },
  "sections": [
    {
      "type": "hero",
      "order": 1,
      "content": {
        "headline": "The step your pipeline is missing.",
        "subheadline": "2,100 engineering teams had the same gap. Here's what they changed — and what happened to their failure rate.",
        "ctaText": "See the 4-minute fix",
        "ctaUrl": "https://example.com/deploy-fix",
        "imagePrompt": "Dark terminal screen with glowing green pipeline visualization, one node highlighted in amber warning color, dramatic depth of field, moody developer workspace in background",
        "alignment": "center",
        "heroLayout": "editorial_tall"
      }
    },
    {
      "type": "text_block",
      "order": 2,
      "content": {
        "body": "Here's a pattern we keep seeing: Teams ship fast. Tests pass. Staging looks clean. Then production breaks at 2 AM on a Thursday and nobody can figure out why. The problem isn't your code. It's the 90-second gap between your last test and your deploy trigger — where config drift, secret rotation, and environment mismatch slip through undetected. We built a single pre-deploy scan that catches these. It takes 4 minutes to set up. It would have prevented 91% of the deploy failures we analyzed across 2,100 teams last quarter."
      }
    },
    {
      "type": "value_prop",
      "order": 3,
      "content": {
        "columns": 3,
        "items": [
          {
            "icon": "Shield",
            "heading": "Config drift caught pre-deploy",
            "description": "Scans your live environment against your deploy manifest. Flags mismatches before they become 2 AM pages."
          },
          {
            "icon": "Zap",
            "heading": "91% failure reduction",
            "description": "Across 2,100 teams in our dataset. The remaining 9% were genuine code bugs — the kind you actually want to find."
          },
          {
            "icon": "Clock",
            "heading": "4-minute setup. No SDK.",
            "description": "One YAML block in your pipeline config. Works with GitHub Actions, GitLab CI, CircleCI, and Jenkins out of the box."
          }
        ]
      }
    },
    {
      "type": "cta",
      "order": 4,
      "content": {
        "buttonText": "Add the scan to my pipeline",
        "buttonUrl": "https://example.com/deploy-fix",
        "variant": "pill",
        "urgencyText": "Free for teams under 50 devs. No credit card."
      }
    },
    {
      "type": "text_block",
      "order": 5,
      "content": {
        "body": "P.S. — We're running a live teardown of a real deploy failure this Thursday at 1 PM ET. The team whose pipeline broke agreed to let us show exactly what went wrong and how the scan would have caught it. No slides. Just a real terminal and a real postmortem. Reply 'teardown' and I'll send you the link — it's not on our website yet."
      }
    },
    {
      "type": "footer",
      "order": 6,
      "content": {
        "companyName": "DeployShield",
        "address": "548 Market St, San Francisco, CA 94104",
        "links": [
          { "text": "Unsubscribe", "url": "{{unsubscribe_url}}" },
          { "text": "Preferences", "url": "https://example.com/prefs" }
        ]
      }
    }
  ],
  "artDirection": {
    "mood": "confident, technical, moody lighting",
    "colorNotes": "Dark backgrounds, amber/green accent for terminal aesthetic",
    "imageStyle": "editorial_photography"
  }
}
\`\`\`

---

### Example B — E-Commerce Flash Sale

**Why this works:** Pattern-interrupt subject (just a number). Urgency with a specific deadline,
not vague "limited time." Product grid with sensory descriptions. Scarcity in CTA.

\`\`\`json
{
  "version": "2.0",
  "theme": "warm",
  "subject": "48 hours. 40% off. Then it's gone.",
  "preheader": "The spring collection drop we've been teasing since January. Your early access starts now — 212 pieces, first come first served.",
  "metadata": {
    "subject_variants": [
      "Your closet called. It has room.",
      "This email expires Sunday at midnight"
    ],
    "visual_density": "rich",
    "target_image_slots": 6,
    "tone": "ecommerce_dtc"
  },
  "sections": [
    {
      "type": "hero",
      "order": 1,
      "content": {
        "headline": "The wait is over.",
        "subheadline": "Spring '26 just dropped — and you're seeing it 24 hours before everyone else. 40% off everything. No code needed.",
        "ctaText": "Shop the drop — 40% off",
        "ctaUrl": "https://example.com/spring-drop",
        "imagePrompt": "Flat lay of spring clothing collection on warm linen background, soft natural window light, muted earth tones with pops of terracotta and sage, editorial fashion photography style",
        "alignment": "center",
        "heroLayout": "editorial_tall"
      }
    },
    {
      "type": "product_grid",
      "order": 2,
      "content": {
        "columns": 3,
        "items": [
          {
            "name": "The Everywhere Blazer",
            "description": "Washed linen. Unstructured shoulders. The blazer that goes from video calls to vineyard dinners without trying.",
            "price": "$128",
            "salePrice": "$77",
            "imagePrompt": "Oversized linen blazer in sand color draped over wooden chair, warm natural light, minimal background",
            "ctaText": "Grab it",
            "ctaUrl": "https://example.com/everywhere-blazer"
          },
          {
            "name": "Coast Pants",
            "description": "Wide-leg. Pockets that actually fit your phone. The fabric weight that works from March through October.",
            "price": "$98",
            "salePrice": "$59",
            "imagePrompt": "Wide leg cotton pants in olive green folded neatly on marble surface, soft shadow, studio lighting",
            "ctaText": "Grab it",
            "ctaUrl": "https://example.com/coast-pants"
          },
          {
            "name": "Day One Tee",
            "description": "Heavyweight cotton. Pre-shrunk. The t-shirt you'll buy three of once you feel the weight.",
            "price": "$48",
            "salePrice": "$29",
            "imagePrompt": "Premium white cotton t-shirt laid flat on warm wood surface, visible fabric texture, overhead shot, natural light",
            "ctaText": "Grab it",
            "ctaUrl": "https://example.com/day-one-tee"
          }
        ]
      }
    },
    {
      "type": "social_proof",
      "order": 3,
      "content": {
        "variant": "metrics",
        "items": [
          { "metric": "4,200+", "label": "five-star reviews" },
          { "metric": "83%", "label": "repeat purchase rate" },
          { "metric": "12 min", "label": "avg. time to sellout on drops" }
        ]
      }
    },
    {
      "type": "cta",
      "order": 4,
      "content": {
        "buttonText": "Shop Spring '26 — 40% off everything",
        "buttonUrl": "https://example.com/spring-drop",
        "variant": "pill",
        "urgencyText": "Ends Sunday, March 30 at 11:59 PM ET. No extensions."
      }
    },
    {
      "type": "text_block",
      "order": 5,
      "content": {
        "body": "P.S. — The Everywhere Blazer sold out in 8 minutes during our fall drop. We made 40% more units this time, but the early access list is also 3x bigger. If there's one piece you don't want to miss, it's that one. Just saying."
      }
    },
    {
      "type": "footer",
      "order": 6,
      "content": {
        "companyName": "Everly Goods",
        "address": "340 Bowery, New York, NY 10012",
        "links": [
          { "text": "Unsubscribe", "url": "{{unsubscribe_url}}" },
          { "text": "Preferences", "url": "https://example.com/prefs" }
        ]
      }
    }
  ],
  "artDirection": {
    "mood": "warm, tactile, aspirational but approachable",
    "colorNotes": "Earth tones — sand, olive, terracotta. White and cream backgrounds.",
    "imageStyle": "editorial_photography"
  }
}
\`\`\`

---

### Example C — Event Invite / Webinar

**Why this works:** Subject uses specific social proof (number + outcome). Lead is story-shaped.
Agenda section replaces vague "join us" with specific value per segment. CTA has scarcity.

\`\`\`json
{
  "version": "2.0",
  "theme": "startup",
  "subject": "The 22-min call that changed her pipeline",
  "preheader": "Live on April 10: Sarah Chen breaks down the exact outbound sequence that booked 14 meetings in one week. Limited to 200 seats.",
  "metadata": {
    "subject_variants": [
      "200 seats. One playbook. April 10th.",
      "She booked 14 meetings in 5 days. Watch how."
    ],
    "visual_density": "rich",
    "target_image_slots": 3,
    "tone": "b2b_saas"
  },
  "sections": [
    {
      "type": "hero",
      "order": 1,
      "content": {
        "headline": "She was about to quit outbound.",
        "subheadline": "Then she tested one sequence change. 14 booked meetings in 5 days. On April 10, she's showing exactly how — live.",
        "ctaText": "Reserve my seat (200 spots)",
        "ctaUrl": "https://example.com/webinar-april",
        "imagePrompt": "Modern conference setup with single spotlight on speaker podium, dark auditorium background with subtle blue accent lighting, dramatic and intimate atmosphere",
        "alignment": "center",
        "heroLayout": "split"
      }
    },
    {
      "type": "text_block",
      "order": 2,
      "content": {
        "body": "Sarah Chen spent 6 months grinding cold outbound. 200 emails a week. Response rate: 2%. She was one bad quarter away from switching to inbound-only. Then she rewrote her sequence using a framework she'd never seen anyone teach publicly. Same list. Same product. Same pricing. But the response rate jumped to 11% in the first week. That's not a typo. This isn't a product demo disguised as a webinar. Sarah's going to open her actual Outreach account, show the sequences, and walk through the copywriting decisions line by line."
      }
    },
    {
      "type": "value_prop",
      "order": 3,
      "content": {
        "columns": 3,
        "items": [
          {
            "icon": "FileText",
            "heading": "The exact 4-email sequence",
            "description": "Copy, timing, and subject lines — screen-shared from her live Outreach account. Not a redacted screenshot."
          },
          {
            "icon": "Target",
            "heading": "The targeting filter she uses",
            "description": "The one signal she checks before adding anyone to a sequence. It takes 30 seconds and eliminates 60% of wasted sends."
          },
          {
            "icon": "BarChart3",
            "heading": "Before/after metrics",
            "description": "Reply rate, meeting rate, and pipeline generated — from the same territory, same quarter, before and after the change."
          }
        ]
      }
    },
    {
      "type": "cta",
      "order": 4,
      "content": {
        "buttonText": "Save my seat — April 10, 1 PM ET",
        "buttonUrl": "https://example.com/webinar-april",
        "variant": "pill",
        "urgencyText": "Capped at 200 attendees. No recording will be shared publicly."
      }
    },
    {
      "type": "text_block",
      "order": 5,
      "content": {
        "body": "P.S. — Everyone who shows up live gets Sarah's sequence template as a Google Doc — pre-loaded with the framework and her notes on why each line exists. That's not available any other way. It's not on our site, and she's never shared it before."
      }
    },
    {
      "type": "footer",
      "order": 6,
      "content": {
        "companyName": "RevOps Weekly",
        "address": "1 Letterman Dr, San Francisco, CA 94129",
        "links": [
          { "text": "Unsubscribe", "url": "{{unsubscribe_url}}" },
          { "text": "Preferences", "url": "https://example.com/prefs" }
        ]
      }
    }
  ],
  "artDirection": {
    "mood": "high-energy, intimate, live-event feel",
    "colorNotes": "Dark background with electric blue accents. Spotlight drama.",
    "imageStyle": "editorial_photography"
  }
}
\`\`\`

---

### Example D — Newsletter (Depth / Editorial)

**Why this works:** Subject is a contrarian take that challenges conventional wisdom.
Alternating image_left / image_right rhythm. Each section is a standalone insight
with its own hook, not a wall of text. No hard sell — soft CTA in P.S.

\`\`\`json
{
  "version": "2.0",
  "theme": "executive",
  "subject": "The best marketers stopped A/B testing",
  "preheader": "Not because it doesn't work — because they found something that works 3x faster. This week's deep dive.",
  "metadata": {
    "subject_variants": [
      "Your A/B tests are lying to you",
      "Read this before you launch another test"
    ],
    "visual_density": "rich",
    "target_image_slots": 6,
    "tone": "b2b_saas",
    "layoutDensity": "airy"
  },
  "sections": [
    {
      "type": "hero",
      "order": 1,
      "content": {
        "headline": "A/B testing is a slow tax on fast teams.",
        "subheadline": "The smartest growth teams we track have replaced it with something faster, cheaper, and weirdly more accurate. Here's the shift.",
        "imagePrompt": "Split screen comparison visualization, one side chaotic with many branching paths, other side clean with single optimized path, abstract data art style, blue and amber palette",
        "alignment": "center",
        "heroLayout": "editorial_tall"
      }
    },
    {
      "type": "image_text",
      "order": 2,
      "content": {
        "headline": "The math problem nobody talks about",
        "body": "A standard A/B test needs ~1,000 conversions per variant for statistical significance. If your page converts at 3%, that's 33,000 visitors per variant. Most teams don't have that traffic — so they either run tests for months or call winners too early. Both are bad.",
        "imagePrompt": "Minimalist statistical chart showing sample size requirements, clean white background, single accent color highlighting the gap between needed and actual traffic",
        "altText": "Chart showing A/B test sample size requirements",
        "layout": "image_left"
      }
    },
    {
      "type": "image_text",
      "order": 3,
      "content": {
        "headline": "What replaced it: Bayesian bandits + qualitative signal",
        "body": "Three teams we profiled this month stopped running traditional A/B tests entirely. They switched to a two-layer system: a multi-armed bandit that auto-allocates traffic to the better variant in real-time, plus a qualitative feedback loop (exit surveys, heatmaps, session replays) that explains why the winner won. Decisions in days, not months.",
        "imagePrompt": "Modern dashboard showing real-time traffic allocation with flowing lines between variants, dark mode interface, data visualization aesthetic",
        "altText": "Real-time traffic allocation dashboard",
        "layout": "image_right"
      }
    },
    {
      "type": "image_text",
      "order": 4,
      "content": {
        "headline": "The result that made us publish this early",
        "body": "One of the three teams — a B2B SaaS with 12,000 monthly uniques — increased their signup rate by 34% in 11 days using this approach. The same test would have taken them 9 weeks with a traditional A/B framework. We have the full breakdown with their permission.",
        "imagePrompt": "Before and after growth chart showing sharp uptick, clean minimal design, single green trend line on white background",
        "altText": "Signup rate improvement chart",
        "layout": "image_left"
      }
    },
    {
      "type": "text_block",
      "order": 5,
      "content": {
        "body": "P.S. — We published the full case study with the team's actual numbers, their bandit configuration, and the survey questions they used. It's behind our member wall but free this week. Reply 'bandit' and I'll send you the direct link — no login required."
      }
    },
    {
      "type": "footer",
      "order": 6,
      "content": {
        "companyName": "Growth Memo",
        "address": "2261 Market St #4667, San Francisco, CA 94114",
        "links": [
          { "text": "Unsubscribe", "url": "{{unsubscribe_url}}" },
          { "text": "Past Issues", "url": "https://example.com/archive" },
          { "text": "Preferences", "url": "https://example.com/prefs" }
        ]
      }
    }
  ],
  "artDirection": {
    "mood": "intellectual, editorial, clean",
    "colorNotes": "White/light grey backgrounds. Minimal accent color. Let the content breathe.",
    "imageStyle": "minimal_clean"
  }
}
\`\`\`

---

### Example E — Professional Services / Consulting

**Why this works:** Credibility-first — leads with a case study, not a claim. The subject
names a specific result. The CTA is low-commitment (audit, not purchase). P.S. uses
a deadline to create urgency without being pushy.

\`\`\`json
{
  "version": "2.0",
  "theme": "nature",
  "subject": "How a 12-person firm closed $2.1M in Q1",
  "preheader": "They changed one thing about their proposal process. The managing partner agreed to let us share the full breakdown.",
  "metadata": {
    "subject_variants": [
      "Your proposals are leaving money on the table",
      "$2.1M from 12 people. Here's the math."
    ],
    "visual_density": "rich",
    "target_image_slots": 4,
    "tone": "professional_services"
  },
  "sections": [
    {
      "type": "hero",
      "order": 1,
      "content": {
        "headline": "They were winning 1 in 5 proposals.",
        "subheadline": "Then they restructured how they present pricing — and their close rate doubled in one quarter. Here's what they changed.",
        "ctaText": "Read the full case study",
        "ctaUrl": "https://example.com/case-study",
        "imagePrompt": "Elegant boardroom table with proposal documents and premium pen, warm natural light from large windows, shallow depth of field, executive business atmosphere",
        "alignment": "center",
        "heroLayout": "split"
      }
    },
    {
      "type": "text_block",
      "order": 2,
      "content": {
        "body": "Whitfield & Associates is a boutique accounting firm in Charlotte. 12 people. Good reputation. But their close rate on new business proposals had flatlined at 20% for two years. They tried better marketing. They tried referral programs. Nothing moved the number. The problem wasn't lead quality. It was the proposal itself — specifically, how they structured the pricing page. They were listing services and hourly rates. Their prospects were comparing those rates to every other firm's rates. A commodity comparison they could never win."
      }
    },
    {
      "type": "image_text",
      "order": 3,
      "content": {
        "headline": "The one structural change",
        "body": "They replaced their line-item pricing with three outcome-based packages. Instead of '$250/hr for tax preparation,' they offered 'Tax Optimization Package: annual review + quarterly planning + audit protection — $18,000/year.' Same services. Reframed as outcomes. Close rate went from 20% to 41% in one quarter. Revenue: $2.1M — up from $900K the same period last year.",
        "imagePrompt": "Side by side comparison of two proposal layouts, one cluttered with line items, one clean with three clear package tiers, business document design",
        "altText": "Proposal structure comparison: line-item vs. package pricing",
        "layout": "image_left"
      }
    },
    {
      "type": "testimonial",
      "order": 4,
      "content": {
        "quote": "We thought we had a marketing problem. Turns out we had a framing problem. Same services, same team, same market — just a different way of showing the value. I wish we'd done this two years ago.",
        "attribution": "David Whitfield",
        "role": "Managing Partner, Whitfield & Associates"
      }
    },
    {
      "type": "cta",
      "order": 5,
      "content": {
        "buttonText": "Get a free proposal audit",
        "buttonUrl": "https://example.com/proposal-audit",
        "variant": "pill",
        "urgencyText": "We review 5 proposals per month. 3 spots left for April."
      }
    },
    {
      "type": "text_block",
      "order": 6,
      "content": {
        "body": "P.S. — The audit takes 20 minutes of your time. You send us your last 3 proposals, we record a Loom walking through what we'd change and why. No contract. No follow-up calls unless you ask. April slots close on the 4th — reply 'audit' to lock one in."
      }
    },
    {
      "type": "footer",
      "order": 7,
      "content": {
        "companyName": "Apex Advisory Group",
        "address": "201 N Tryon St, Charlotte, NC 28202",
        "links": [
          { "text": "Unsubscribe", "url": "{{unsubscribe_url}}" },
          { "text": "Preferences", "url": "https://example.com/prefs" }
        ]
      }
    }
  ],
  "artDirection": {
    "mood": "premium, trustworthy, warm but professional",
    "colorNotes": "Navy and cream. Gold accents sparingly. No startup energy.",
    "imageStyle": "editorial_photography"
  }
}
\`\`\`

---

### Example F — Creator / Personal Brand

**Why this works:** First-person, story-driven. Feels like a personal email, not a marketing blast.
No hero image — starts with text, which is on-brand for creator newsletters. CTA is embedded
naturally in the P.S. instead of a loud button.

\`\`\`json
{
  "version": "2.0",
  "theme": "minimal",
  "subject": "I almost didn't send this one",
  "preheader": "It's about a mistake I made last month that cost me $14,000. And the stupid-simple fix I should have known.",
  "metadata": {
    "subject_variants": [
      "The $14K mistake I made in February",
      "Read this before you raise your prices"
    ],
    "visual_density": "minimal",
    "target_image_slots": 2,
    "tone": "creator_personal_brand",
    "layoutDensity": "airy"
  },
  "sections": [
    {
      "type": "text_block",
      "order": 1,
      "content": {
        "body": "Last month I raised my prices. Finally. After two years of charging the same rate while my results got 3x better, I bumped my project fee from $8K to $15K. I was terrified. I told myself all the stories: 'nobody will pay that,' 'I'll lose all my clients,' 'who do I think I am.' Then I sent the new pricing to five warm leads. Three ghosted. One said 'let me think about it' (which means no). One said yes immediately — didn't even negotiate."
      }
    },
    {
      "type": "text_block",
      "order": 2,
      "content": {
        "body": "Here's where I messed up. I panicked after the three ghosts. I sent a follow-up offering my old rate as a 'special discount.' Two of them took it. So now I had two clients at $8K and one at $15K — doing the same work. That $14K gap? I created it myself by flinching."
      }
    },
    {
      "type": "image_text",
      "order": 3,
      "content": {
        "headline": "The fix (embarrassingly obvious in hindsight)",
        "body": "I called a friend who sells enterprise software. She laughed and said: 'You sent one email at the new price and panicked after 3 days? We lose 80% of deals and still hit quota. Your sample size was five.' She was right. I wasn't getting rejected. I was getting a normal conversion rate for a new price point — and then undercutting myself before the data even came in.",
        "imagePrompt": "Minimalist illustration of a price tag being crossed out and rewritten higher, simple line art on white background, single accent color",
        "altText": "Price adjustment illustration",
        "layout": "image_right"
      }
    },
    {
      "type": "text_block",
      "order": 4,
      "content": {
        "body": "The lesson that cost me $14,000: **price changes need a sample size of at least 20 conversations before you decide they're not working.** Not 5. Not 3. Twenty. I'm back at $15K. No discounts. And this month I've closed two more at the new rate. The math works. I just needed to survive the flinch."
      }
    },
    {
      "type": "text_block",
      "order": 5,
      "content": {
        "body": "P.S. — I wrote a deeper breakdown of the pricing framework I'm using now — the one my enterprise friend taught me. It's a 12-minute read with the actual email templates I send to new leads. I put it in the members' area: reply 'pricing' and I'll send you the link. No upsell. Just the framework."
      }
    },
    {
      "type": "footer",
      "order": 6,
      "content": {
        "companyName": "The Freelance Memo",
        "address": "Austin, TX",
        "links": [
          { "text": "Unsubscribe", "url": "{{unsubscribe_url}}" },
          { "text": "Archive", "url": "https://example.com/archive" }
        ]
      }
    }
  ],
  "artDirection": {
    "mood": "personal, honest, intimate — like a letter from a friend",
    "colorNotes": "Minimal. Black text, white background. Maybe one muted accent. Let the words do the work.",
    "imageStyle": "minimal_clean"
  }
}
\`\`\`

`.trim();

/**
 * Compact golden examples: 2 examples (A + F) for standard/minimal tiers.
 * Example A = most common B2B SaaS pattern; Example F = most different structure (creator).
 */
export const GOLDEN_EMAIL_EXAMPLES_COMPACT_MD = `
These are reference examples of excellent email copy in VA2 Design Manifest format.
Study the copy patterns — hooks, rhythm, specificity, CTAs — and apply the same
quality standard to every manifest you generate. Do NOT copy these literally.
Adapt the patterns to the user's brand, audience, and brief.

---

### Example A — B2B SaaS Product Launch

**Why this works:** Curiosity-gap subject. Pain-agitation lead. Specific numbers in value props.
Single clear CTA with verb + outcome. P.S. adds exclusivity the reader didn't expect.

\`\`\`json
{
  "version": "2.0",
  "theme": "executive",
  "subject": "Your deploy pipeline has a blind spot",
  "preheader": "We found it in 2,100 teams' CI/CD setups. Takes 4 minutes to fix — or 4 hours to debug later.",
  "metadata": {
    "subject_variants": [
      "91% of deploy failures trace back to one step",
      "Fix this before Friday's release"
    ],
    "visual_density": "rich",
    "target_image_slots": 4,
    "tone": "b2b_saas"
  },
  "sections": [
    { "type": "hero", "order": 1, "content": { "headline": "The step your pipeline is missing.", "subheadline": "2,100 engineering teams had the same gap. Here's what they changed — and what happened to their failure rate.", "ctaText": "See the 4-minute fix", "ctaUrl": "https://example.com/deploy-fix", "imagePrompt": "Dark terminal screen with glowing green pipeline visualization, one node highlighted in amber warning color, dramatic depth of field, moody developer workspace in background", "alignment": "center", "heroLayout": "editorial_tall" } },
    { "type": "text_block", "order": 2, "content": { "body": "Here's a pattern we keep seeing: Teams ship fast. Tests pass. Staging looks clean. Then production breaks at 2 AM on a Thursday and nobody can figure out why. The problem isn't your code. It's the 90-second gap between your last test and your deploy trigger — where config drift, secret rotation, and environment mismatch slip through undetected. We built a single pre-deploy scan that catches these. It takes 4 minutes to set up. It would have prevented 91% of the deploy failures we analyzed across 2,100 teams last quarter." } },
    { "type": "value_prop", "order": 3, "content": { "columns": 3, "items": [ { "icon": "Shield", "heading": "Config drift caught pre-deploy", "description": "Scans your live environment against your deploy manifest. Flags mismatches before they become 2 AM pages." }, { "icon": "Zap", "heading": "91% failure reduction", "description": "Across 2,100 teams in our dataset. The remaining 9% were genuine code bugs — the kind you actually want to find." }, { "icon": "Clock", "heading": "4-minute setup. No SDK.", "description": "One YAML block in your pipeline config. Works with GitHub Actions, GitLab CI, CircleCI, and Jenkins out of the box." } ] } },
    { "type": "cta", "order": 4, "content": { "buttonText": "Add the scan to my pipeline", "buttonUrl": "https://example.com/deploy-fix", "variant": "pill", "urgencyText": "Free for teams under 50 devs. No credit card." } },
    { "type": "text_block", "order": 5, "content": { "body": "P.S. — We're running a live teardown of a real deploy failure this Thursday at 1 PM ET. The team whose pipeline broke agreed to let us show exactly what went wrong and how the scan would have caught it. No slides. Just a real terminal and a real postmortem. Reply 'teardown' and I'll send you the link — it's not on our website yet." } },
    { "type": "footer", "order": 6, "content": { "companyName": "DeployShield", "address": "548 Market St, San Francisco, CA 94104", "links": [ { "text": "Unsubscribe", "url": "{{unsubscribe_url}}" }, { "text": "Preferences", "url": "https://example.com/prefs" } ] } }
  ],
  "artDirection": { "mood": "confident, technical, moody lighting", "colorNotes": "Dark backgrounds, amber/green accent for terminal aesthetic", "imageStyle": "editorial_photography" }
}
\`\`\`

---

### Example F — Creator / Personal Brand

**Why this works:** First-person, story-driven. Feels like a personal email, not a marketing blast.
No hero image — starts with text, which is on-brand for creator newsletters. CTA is embedded
naturally in the P.S. instead of a loud button.

\`\`\`json
{
  "version": "2.0",
  "theme": "minimal",
  "subject": "I almost didn't send this one",
  "preheader": "It's about a mistake I made last month that cost me $14,000. And the stupid-simple fix I should have known.",
  "metadata": {
    "subject_variants": [
      "The $14K mistake I made in February",
      "Read this before you raise your prices"
    ],
    "visual_density": "minimal",
    "target_image_slots": 2,
    "tone": "creator_personal_brand",
    "layoutDensity": "airy"
  },
  "sections": [
    { "type": "text_block", "order": 1, "content": { "body": "Last month I raised my prices. Finally. After two years of charging the same rate while my results got 3x better, I bumped my project fee from $8K to $15K. I was terrified. I told myself all the stories: 'nobody will pay that,' 'I'll lose all my clients,' 'who do I think I am.' Then I sent the new pricing to five warm leads. Three ghosted. One said 'let me think about it' (which means no). One said yes immediately — didn't even negotiate." } },
    { "type": "text_block", "order": 2, "content": { "body": "Here's where I messed up. I panicked after the three ghosts. I sent a follow-up offering my old rate as a 'special discount.' Two of them took it. So now I had two clients at $8K and one at $15K — doing the same work. That $14K gap? I created it myself by flinching." } },
    { "type": "image_text", "order": 3, "content": { "headline": "The fix (embarrassingly obvious in hindsight)", "body": "I called a friend who sells enterprise software. She laughed and said: 'You sent one email at the new price and panicked after 3 days? We lose 80% of deals and still hit quota. Your sample size was five.' She was right. I wasn't getting rejected. I was getting a normal conversion rate for a new price point — and then undercutting myself before the data even came in.", "imagePrompt": "Minimalist illustration of a price tag being crossed out and rewritten higher, simple line art on white background, single accent color", "altText": "Price adjustment illustration", "layout": "image_right" } },
    { "type": "text_block", "order": 4, "content": { "body": "The lesson that cost me $14,000: **price changes need a sample size of at least 20 conversations before you decide they're not working.** Not 5. Not 3. Twenty. I'm back at $15K. No discounts. And this month I've closed two more at the new rate. The math works. I just needed to survive the flinch." } },
    { "type": "text_block", "order": 5, "content": { "body": "P.S. — I wrote a deeper breakdown of the pricing framework I'm using now — the one my enterprise friend taught me. It's a 12-minute read with the actual email templates I send to new leads. I put it in the members' area: reply 'pricing' and I'll send you the link. No upsell. Just the framework." } },
    { "type": "footer", "order": 6, "content": { "companyName": "The Freelance Memo", "address": "Austin, TX", "links": [ { "text": "Unsubscribe", "url": "{{unsubscribe_url}}" }, { "text": "Archive", "url": "https://example.com/archive" } ] } }
  ],
  "artDirection": { "mood": "personal, honest, intimate — like a letter from a friend", "colorNotes": "Minimal. Black text, white background. Maybe one muted accent. Let the words do the work.", "imageStyle": "minimal_clean" }
}
\`\`\`

`.trim();
