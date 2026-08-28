# Taste

Aloya is not a template. It is island infrastructure. Pages that look like
every other AI product are a product failure, same as a wrong ETA.

This file is the law for `app.aloya.cy`, `aloya.cy`, and mobile. A change
that ignores the surface it sits on is not done. Keep this file identical
in `aloyacy` and `aloyaexplorer`.

---

## Two surfaces, two patterns. Do not mash them.

| Surface | Type | Palette | Icons |
| --- | --- | --- | --- |
| Marketing (`aloya.cy`) | Alegreya display, Titillium Web body. Civic, Greek-capable. | Aegean Chalk: limestone, terracotta, aegean-deep, olive, ink. | Custom SVGs in `src/components/Icons.tsx`. No Lucide on new work. |
| Rider app (`app.aloya.cy` + mobile) | Follow `src/styles.css` / `mobile/constants/theme.ts` as they stand. Do not restyle the whole app as a side-effect. | Same token names: limestone, aegean, ochre, olive, ink. No hex literals. | Match neighbouring screens. Do not drop a new icon family into one card. |

If a screen already has a rhythm, extend that rhythm. Do not invent a third
look because a prompt felt "premium".

---

## Type you will not introduce

These fonts are the 2026 fingerprint of unchosen AI UI. Do not add them.
Do not "just for this page".

Inter, Roboto, Open Sans, Lato, Montserrat, Poppins, Nunito, Outfit, Sora,
Plus Jakarta Sans, DM Sans, Space Grotesk, Geist, Geist Mono, Instrument
Sans, Instrument Serif, Fraunces, Cormorant, Young Serif, Bricolage
Grotesque (new work), Satoshi, Cabinet Grotesk as a default reach.

Alegreya is the marketing display because it has Greek and is not in that
list. Titillium Web is the civic grotesque (EIT Urban Mobility). That pair
is a decision. Leave it.

Known debt, do not "fix" in a drive-by: the rider app still sets
`--font-display: Bricolage Grotesque` and `--font-sans: Geist`. Mobile
matches. `aloyaexplorer/src/components/CyprusMap.tsx` hard-codes Inter.
Those are named jobs, not drive-by restyles.

---

## Picture you will not ship

- Purple / indigo / violet gradients. "VibeCode purple".
- Glow, neon outer shadow, mesh blob behind a hero.
- Three equal icon-cards in a row.
- Badge above a centred H1 ("New", "AI-powered", "v2").
- Numbered `01 · The problem` chapter eyebrows.
- Emoji as UI.
- Lucide / Heroicons on marketing. The olive, compass, ticket set exists.
- Fake product UI made of empty rounded rectangles.
- Stock "person pointing at a phone on a bus" that is not Cyprus.
- Logo walls of companies that are not on this island.

Photography is Cyprus or it is not on the page. Pulse already uses real
island plates. Follow that.

---

## Words you will not ship

Read the line out loud. If you would not say it to someone at Solomos
Square, rewrite it.

Banned on rider and marketing surfaces:

unlock, unleash, empower, elevate, seamless, robust, cutting-edge,
groundbreaking, revolutionary, game-changer, next-gen, supercharge,
leverage, harness, streamline, ecosystem, transformative, delve, tapestry,
underscores, landscape (as metaphor), "in today's fast-paced world",
"whether you're a commuter or a tourist", "it's never been easier",
"built different", "AI-powered".

Banned shapes, even with clean words:

- Anaphora stacked as design ("Wait. Ride. Arrive.")
- "It's not X. It's Y." as a whole page.
- Em dash as a stylistic crutch. Use a period, a comma, or a hyphen.
- Jargon on `aloya.cy`. No RAPTOR, GTFS-RT, PostgREST, Worker, ledger.
  The rider hears "when the bus gets here". Partners hear "the same
  number the rider sees".
- Claims we have not measured. No "±90 seconds" until the ledger says so.
  Reliability stays `unknown` under 30 samples. Same number everywhere.

Tone: short sentences. Concrete. Cyprus English, not Silicon Valley.
One idea per line. Greek must fit; English must not show off.

Good, already in the product:

> When does my bus actually get here, and can I trust that number?
> Motion stays the card. Aloya stays the truth.
> The same number the rider sees. As a feed.

Not good, even if it is already on the marketing site. Do not copy this
register for new pages:

> Transit deserves the same care we give a record sleeve.

Magazine craft-voice is still slop. Kill it when you touch that block.

---

## Innovation is not a template with better adjectives

Do not clone Linear, Apple, Stripe, or "another mobility app". Combine
what is already ours until it could only be Cyprus:

- A live departure board, not a feature grid.
- Operator liveries kept, not flattened.
- Bilingual as structure, not a flag icon.
- Motion as the card, Aloya as the number.
- A waitlist that admits the Truth API is not live yet.

If a layout exists on ten SaaS homepages this week, it is not our edge.
Think the pattern again: what would a Nicosia kiosk, a hotel desk, and a
phone in the rain all recognise as the same object?

---

## Before a page is done

1. Tokens only. No `bg-[#…]`, no new font import, no new icon pack.
2. Neighbouring screens still look like family.
3. Copy proofread in English. Then check the Greek still fits.
4. No banned word, no banned font, no three-card strip, no purple.
5. Every number is a real number or it is not on the page.
6. Marketing page lives on `aloya.cy`. App page lives on `app.aloya.cy`.
7. You would show it to a stranger at a stop without apologising.

If any box fails, the page is not done. Polish it. Do not ship the draft.
