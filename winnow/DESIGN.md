# Winnow design system

How getwinnow.in is designed, and the rules to follow when changing it. Every value here is taken from the code: tokens live in `app/globals.css` (`@theme` and `@utility`), and components in `components/`.

---

## 1. Principles

1. **Quiet, then precise.** White space, one accent colour, large confident headlines. Nothing decorative that does not explain the product.
2. **Dots are the language.** People are dots. Hiring is shown as many dots narrowing to a few, and one becoming blue. The logo, the hero, the home figure and the How we work drawings all speak it.
3. **Motion explains.** Every animation shows a step of the work (sourcing, filtering, ranking, scheduling). If it does not explain something, it does not ship.
4. **Nothing jumps.** Elements are laid out from the start and only fade or move with `transform`. Swapping content never changes a box's size. Target layout shift: under 0.01.
5. **Works without the effects.** Every animation has a still version for reduced motion and a readable version without JavaScript.
6. **Phones first-class.** Every section is checked at 320px wide and on short screens, not just shrunk from desktop.

---

## 2. Brand

### Name
Always lowercase in the wordmark: **winnow**. In sentences: "Winnow".

### The mark
Ten dots in a downward triangle (4, 3, 2, 1). Nine are ink, and the last one, at the bottom point, is signal blue: many candidates narrowing to the shortlist and the hire. It is the same ten dots the hero animation ends on.

- Built in code: `components/Logo.tsx` (`Mark`, and `Logo` = mark + wordmark).
- Wordmark: Funnel Display, bold (700), letter-spacing −0.03em. The mark sits at 0.86em, with a 0.42em gap.
- Sizes in use: nav 21px, footer 17px, the contact section uses it large.
- The bottom dot is always signal blue and the others always ink (or `currentColor` on dark). Never recolour, rotate or rearrange the dots.

---

## 3. Colour

| Token | Hex | Use |
|---|---|---|
| `paper` | `#FFFFFF` | Page background, cards |
| `mist` | `#F6F7F8` | Alternate section background, inner panels, chips |
| `ink` | `#0A0C0F` | Headlines, body text, primary dots |
| `slate` | `#6B7280` | Secondary text, labels, inactive tabs |
| `hairline` | `#E8EAED` | 1px borders and dividers |
| `signal` | `#1B4DFF` | The one accent: actions, the chosen or found dot, active states, focus |

Supporting values:
- **"Not a match" dots:** `#C3C8CF`.
- **Primary button hover:** `#1440E0`.
- **Signal tints:** chips use `signal/[0.06]` fill with a `signal/30` border; focused inputs get a 3px `signal/14%` ring.

Rules:
- **Signal is the only accent.** Use it for actions, the "found/hired" dot, active states and focus, never for large fills or decoration. No other hues.
- **Sections alternate** paper and mist to separate topics; don't put two mist sections back to back.
- **Text colour:** text is ink or slate only. Slate is the floor for readable text (4.83:1 on paper, 4.51:1 on mist), so never go lighter for body copy.
- **No dark mode:** the site is light only (`color-scheme: light`).

---

## 4. Typography

| Family | Weights | Use |
|---|---|---|
| **Funnel Display** | 600, 700 | Headlines, eyebrows, wordmark |
| **Funnel Sans** | 400, 500, 600 | Body and UI |
| **Geist Mono** | 400, 500 | Numbers, scores, labels, times |

All are loaded with `next/font` (`display: swap`).

### Scale

| Style | Size | Weight / tracking / leading | Used for |
|---|---|---|---|
| `display-xl` | clamp(2.75rem, 8.5vw, 7.5rem) | 600 / −0.04em / 0.95 | Largest statements |
| `hero-tagline` | clamp(1.875rem, 4.6vw, 4rem) | 600 / −0.035em / 1.06 | Hero line, inner page titles |
| `display-lg` | clamp(2.125rem, 5.2vw, 4.25rem) | 600 / −0.03em / 1.05 | Section headlines |
| Sub-headline | 1.25rem (to 1.5rem) | Display 600 / −0.015 to −0.02em | Closing lines under a demo, card titles |
| `body-lg` | clamp(1.0625rem, 1.35vw, 1.3125rem) | 400 / 1.45, slate | Section intros |
| `eyebrow` | clamp(1rem, 1.15vw, 1.1875rem) | Display 600 / −0.01em, slate | Short section labels ("How we work", "Why they fit") |
| `label` | 11px | Mono, UPPERCASE, +0.14em, slate | Numbers (01, 02), small meta ("© 2026") |
| UI text | 15 / 14 / 13.5 / 12.5px | Sans 400–500 | Buttons, chips, card body, captions |

Rules:
- **Sentence case** everywhere, including headings, buttons and labels. Only `label` is uppercase.
- **Headlines are sentences** and end with a full stop ("Interviews, booked around your calendar.").
- **Balanced line breaks:** headlines use `text-wrap: balance` and a `max-w-[18ch]`–`[22ch]` measure; body text stays within about `30–34rem`.
- **Numbers** (scores, counts, times) use mono with `tabular-nums` so they don't jitter as they change.
- **Form inputs** use 16px text, so iOS doesn't zoom in.

---

## 5. Layout and spacing

- **Container:** `wrap` = max 1180px, centred, side padding 20px (24px from 640px up).
- **Section rhythm:** `section-y` = vertical padding clamp(7rem, 16vh, 13rem).
- **Nav:** fixed and 64px tall, so content that pins under it uses `top-16`.
- **Breakpoints (Tailwind):** `sm` 640, `md` 768, `lg` 1024.
  - Phones (under 640): single column.
  - `sm`: two-column grids for small cards.
  - `md`: side-by-side panels (report card, scheduling, stages drawing beside the list).
  - `lg`: four-up cards, chat demo beside its text.
- **Short screens** get their own rules (`max-height` 560 / 640 / 700px), so pinned sections fit on one screen.
- **Section pattern:** centred `display-lg` headline → `body-lg` intro (mt-5) → the demo or card (mt-14) → optional closing sub-headline (mt-10).
- **Inner page opening (`PageHead`):** eyebrow label → `hero-tagline` title → one short line, centred.

---

## 6. Shape and elevation

| Radius | Where |
|---|---|
| Full (pill) | Buttons, chips, status dots, tabs |
| 28px | Large feature panels (pricing card, "Most suitable candidates never apply" figure) |
| 24px | Product demo cards (chat, scheduling) |
| 22px | Content cards (detailed report, booking form, "What we need" and "hidden signals" cards) |
| 18px | Chat bubbles, with one 6px corner as the tail (bottom-left incoming, bottom-right outgoing) |
| 14px / 12px | Tiles inside bubbles, file chips, form inputs |
| 6px | Calendar blocks |

- **Borders:** 1px `hairline`. Cards on mist sit on paper with a hairline ring.
- **Shadows** (soft and low):
  - `shadow-lift`: `0 1px 2px rgb(10 12 15 / .06)`, for cards and buttons.
  - `shadow-lift-hover`: `0 6px 16px -4px rgb(10 12 15 / .14)`, on hover.
  - Product demo cards add a long, soft drop: `0 24px 48px -24px rgb(10 12 15 / .18)`.

---

## 7. Components

### Buttons
- **Primary:** `btn-primary`, a signal-blue pill, 15px/500, padding 0.8rem × 1.4rem. On hover it lifts 2px, its shadow deepens and the fill darkens to `#1440E0`. Use one per view, labelled **"Book a call"**. The nav uses a compact version, hidden on phones.
- **Secondary:** an outlined pill (paper fill, hairline border, ink text, 14px/500, at least 43px tall). Used for "View full report".
- **Chevron link:** `link-chevron`, signal text with a `›`. On hover it underlines and the chevron slides 3px. Used for "See detailed report ›" and "Book a call ›". Pad it vertically (`py-1.5`) so it's easy to tap.

### Chips
Small rounded-full tags, 12.5–14px.
- **Neutral:** hairline border, ink text, e.g. "Sourced", "Go".
- **Verified:** signal tint fill and border, signal text, often with a check icon.
- **Gap:** slate text with a strike-through, for a missing requirement.

### Cards
White or mist, 22px radius, `p-6`–`p-8`. They hold a number `label` (01, 02…), a 1.25rem display title and a 15px slate line. Grids of cards rise in one after another (`rise` with an 80ms step).

### Form fields
- **Field:** 44px tall (`h-11`), 12px radius, hairline border, 16px text.
- **States:** hover darkens the border, and focus turns it signal blue with the 3px tint ring.
- **Labels:** sit above each field. Optional fields say "(optional)" in slate.

### Nav
Transparent at the top. After 24px of scroll it becomes frosted (`paper/85` with a 12px backdrop blur) with a hairline bottom border. The active tab is ink with a 1px underline; the others are slate.

### Footer
A mist band with the logo, links (How we work, Pricing, Contact) and "© 2026" as a `label`.

### Icons
Inline SVG only, with no icon library. Strokes are 1.5–1.75 with round caps and joins, in `currentColor` (usually signal). In use: check, clock, upload arrow.

---

## 8. Motion

**Easing:** `ease-out-expo` `cubic-bezier(.16, 1, .3, 1)` for things arriving, and `ease-standard` `cubic-bezier(.4, 0, .2, 1)` for state changes.

| Duration | For |
|---|---|
| 150–200ms | Hover, link underline, button lift |
| 300ms | Colour changes (active tab, active stage) |
| 400–500ms | Content swaps (report tabs, chat items, scheduling steps) |
| 600–700ms | Reveals (headline mask, cards rising) |

### Patterns
- **Mask reveal** (`Reveal`): text slides up from behind a mask once, when 15% of it is in view, with a 60ms stagger between headline and body.
- **Rise:** cards fade in and rise 18px, one after another.
- **Scroll-scrubbed:** pinned sections publish scroll progress as the CSS variable `--p` (0 to 1), and each element reads its own window of it with `clamp()`. Used by "What comes to mind…" and the home process figure.
- **Canvas drawings:** drawn from the progress value, so the same scroll position always gives the same frame. Random-looking positions use fixed-seed noise, so server and browser render the same thing.
- **Demos that play once** (chat, ranked list, scheduling) start when their panel is on screen. A part of a demo that sits lower on phones waits until that part is visible.

### Rules
- **Only animate `transform` and `opacity`.** Never animate width, height or position in a way that pushes other content.
- **No resizing:** text that swaps (report tabs, captions) shares one grid cell or a fixed height, so the box never changes size.
- **Pause off-screen:** animation loops stop when off screen (IntersectionObserver), and the canvas resolution is capped at 2× the device pixel ratio.
- **Lighter on phones:** fewer particles (the hero uses 700 dots on phones, 2000 on desktop), no idle drift on touch screens, and smooth scrolling (Lenis) is off on touch devices.
- **Reduced motion:** every animation has a still version, and transitions drop to near-zero length.
- **Without JavaScript:** the full content shows, with no hidden text waiting for a reveal (`html.js` gates every hidden state).

### Animation inventory

| Where | What it shows |
|---|---|
| Home, hero | Dots form the "winnow" wordmark, then sort through sourcing, reading and verifying, and settle into the mark |
| Home, "What comes to mind…" | Hiring worries appear, get struck through in blue, and blow away letter by letter; then "Introducing winnow" |
| Home, Source / Evaluate / Shortlist | One pool (applicants + people found) → three filter lines with live counts → ten ranked rows → "You picked 5. We booked the interviews." |
| How we work, chat | One message to a ranked shortlist, step by step |
| How we work, stages | The same 24 dots morph through Brief → Schedule → the mark. Beside the list on desktop; a pinned strip under the nav on phones |
| How we work, beyond applicants | Your applicants vs the wider market, and the right fit drawn from both |
| How we work, ranked list | Rows sort into rank, scores count up, "Verified" lands |
| How we work, detailed report | Requirement bars and the report text switch between candidates on a timer until the visitor picks one |
| How we work, scheduling | Reads your calendar, finds open slots, messages candidates, books and follows up |

### Dot meaning (keep consistent)
- **Ink:** applicants, people in the pool.
- **Signal blue:** found / never applied, chosen, the hire.
- **Grey `#C3C8CF`:** not a match.
- **Rings:** people we found (sourced), as opposed to filled dots for applicants.

---

## 9. Phones and responsiveness

- **Test sizes:** 320, 360, 375, 390 and 430 wide; 375×667 and 320×568 short phones; 844×390 landscape; iPad 768 and 1024; laptop 1280; desktop 1920.
- **No sideways scroll:** no horizontal overflow at any width (`overflow-x: clip` is a safety net, not a fix).
- **Tap targets:** at least 24px in every direction; aim for 40px or more on buttons.
- **Pinned elements leave room to read:** the phone stage strip is 176px (128px on screens under 700px tall).
- **Small figures:** short labels switch in automatically through container queries (e.g. "Requirements" instead of "Your requirements").
- **Status text:** status lines in demo headers don't wrap (`whitespace-nowrap`), and secondary header text hides under 380px wide.

---

## 10. Writing and voice

**Voice:**
- Plain, short sentences.
- "We" is Winnow; "you" is the hiring company.
- Calm and confident, never salesy.
- British/Indian spelling ("licence").
- Indian context: CTC, notice period, Naukri, campus placement cells.

**The story, always in this order:**
1. We **source** (inbound and outbound), **evaluate** and **shortlist**, with a detailed report on why each candidate fits.
2. **You choose** who to meet.
3. We **schedule** the interviews around your calendar and handle all the back-and-forth.
4. You interview and make the offer.

**Words and labels:**
- **CTA:** "Book a call" everywhere. The contact section heading is "Let us run your next hire."
- **Demo people:** Indian first names with a surname initial (Priya S., Rahul M.), and candidates as "Candidate A/B/C".
- **Times:** 24-hour in product UI (15:00).

**Don't:**
- Use real or placeholder company names in demos (no "Acme").
- Frame it as "hiring shouldn't be complicated".
- Offer free tests or trials ("prove it before you commit").
- Suggest interview questions ("Worth asking in the interview").
- Describe services that aren't listed under "Included on every role" on the Pricing page.
- Add an "Or email us at…" line under the form.
- Put a city in the footer.

---

## 11. Accessibility

- **Focus:** a 2px signal outline with a 2px offset on every focusable element.
- **Contrast** (all pass WCAG AA):
  - Ink on paper: 19.6:1.
  - Slate on paper: 4.83:1; slate on mist: 4.51:1.
  - Signal on paper: 5.91:1; white on signal: 5.91:1.
- **Animated demos** are `aria-hidden`, with an `sr-only` paragraph describing what they show. The report uses proper tabs (`tablist`/`tab`/`tabpanel`).
- **Live updates** (form status, the "View full report" note) use `aria-live`.
- **Motion:** reduced motion is respected everywhere (see section 8).

---

## 12. Before you ship

- `tsc` and `next build` pass.
- Walk every page on a phone (390×844) and a short phone (375×667), screen by screen.
- Across all test sizes: no horizontal overflow, no console errors, layout shift under 0.01, no tap target under 24px.
- Every animation still works and has its reduced-motion version.
- Form tests mock `api.web3forms.com`, so no real inquiries are sent.
- Copy follows section 10.
