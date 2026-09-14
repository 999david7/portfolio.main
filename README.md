# Portfolio

Personal portfolio site. Plain HTML, CSS and JavaScript on the front end —
no frameworks, no build step, no bundler — with a small hardened Node/Express
API behind the contact form.

## Run it

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # same, with auto-restart on file changes
```

Optional configuration:

```bash
cp .env.example .env
```

Set `CONTACT_EMAIL` to receive form submissions. If you also fill in the SMTP
variables, submissions are emailed to you; either way they're appended to
`data/messages.json` (git-ignored).

## Layout

```
index.html          Home — hero, about, work, journey, FAQ, contact
projects.html       All projects, with filtering and search
404.html            Not-found page
css/style.css       The whole design system (tokens, components, motion)
js/main.js          All interactivity, one dependency-free file
server.js           Express: static site + POST /api/contact
api/contact.js      The same endpoint as a serverless function
favicon.svg         Brand mark
files/resume.pdf    Résumé, linked from the hero and footer
imgs/               Logos and tech icons
```

## Front end

Everything lives in two files.

**`css/style.css`** is token-driven. Colours, spacing, radii, easing and type
are all custom properties declared once in `:root`. To restyle the site, edit
the tokens.

The look is deliberately plain and professional: one neutral type family,
squared corners, and a restrained accent used for links, labels and figures.

Motion is kept subtle and functional — it responds to you rather than
performing. Sections fade up as they arrive; buttons, cards, chips and links
lift or underline on hover; the nav underline grows from the left; timeline
dots scale in behind their row. Everything moves 1–3px over 120–380ms, using
only `transform` and `opacity`. The two standing animations are the
availability dot and the wave on the hero button.

The page runs **light at the top and dark from the transition band down** —
one continuous scroll, not a theme switch. `:root` holds the light palette and
the `.dark` class re-declares the same token names; because custom properties
inherit, everything inside a `.dark` wrapper flips with no per-component rules.
`projects.html` and `404.html` carry `.dark` on `<body>`, since they continue
the dark half of the home page.

**`js/main.js`** is a series of self-guarding modules inside one IIFE. Each one
looks for its own markup and returns early if it isn't there, so the same script
serves every page. Behaviour is attached with `data-` attributes rather than
classes:

| Attribute | What it does |
| --- | --- |
| `data-reveal` | Fades the element up on scroll; `style="--d:2"` staggers it. |
| `data-faq` | Turns the container into a single-open accordion. |
| `data-copy="…"` | Copies the value to the clipboard, with fallback for non-HTTPS. |
| `data-zone-sync` | Marks a fixed overlay (nav, back-to-top, cursor) that should pick up `.dark` while it floats over a dark zone. |
| `data-filter` / `data-search` / `data-project` | Powers the projects page filtering. |
| `data-contact-form` | Validation, submission, and graceful degradation. |

`prefers-reduced-motion` is honoured everywhere: transitions and animations
collapse, the fade-ups resolve immediately, and scrolling becomes instant.
Nothing is hidden behind an animation that reduced motion would suppress —
the same applies without JavaScript, where reveals, timeline dots and FAQ
answers all render open.

## Contact form

The form posts JSON to `api/contact` (a relative path, so it works from any
subdirectory). `server.js` validates it, rate limits to 5 submissions per IP per
10 minutes, checks a honeypot field, stores the message, and optionally emails it.

If no API is reachable — static hosting, an offline visitor, or opening
`index.html` straight off disk — the form falls back to opening a pre-filled
`mailto:` compose window instead of failing.

### Deploying statically

The site works as pure static files (GitHub Pages, Netlify, S3): every asset
path is relative and nothing needs a server to render. Only the contact API
needs Node. On a serverless host, `api/contact.js` provides the same endpoint —
set the SMTP variables there, since there's no filesystem to store messages in.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/contact` | Submit the contact form. Returns `{ ok: true }`. |
| `GET` | `/api/health` | Uptime and whether SMTP is configured. |
