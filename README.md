# Menorah at the Falls 2026

Registration page for Chabad at the Falls' Chanukah event, **Sunday, December 6, 2026** at Riverside Park, Chagrin Falls.
Live at **https://menorahatthefalls.com**. This repository is the single source of truth; nothing else needs to be kept.

## How it works

| Piece | Where it lives | Account |
|---|---|---|
| Website (this repo, GitHub Pages, files at repo root) | github.com/chabadchagrin/menorahatthefalls | GitHub `chabadchagrin` |
| Registrations (Google Sheet) | "Menorah at the Falls 2026 Registrations", ID `1aZVuxBNrEI9_SZ6mTBnAIoep2cfCv5IqmstS30eT2G4` | Google `rabbi@jewishchagrinfalls.com` |
| Backend (Google Apps Script web app) | Apps Script project "Menorah at the Falls 2026 Registrations", ID `1XYeszet3vMKwfsVlsmb45GWrGHxTnRjp_8rqDNF09UwPz4XGPkVFHcwd`. Copy of the code: `apps-script/Code.gs` | Google `rabbi@jewishchagrinfalls.com` |
| Payments (Stripe Checkout) | Stripe account "Chabad at the Falls", live restricted key "Menorah form" (Checkout Sessions: Write only) | Chabad Stripe |
| Domain + DNS | Squarespace Domains, menorahatthefalls.com | Chabad Squarespace |
| Graphics source | Canva: main flyer `DAHaBjESLGw`, nightly schedule `DAHaB2-v8Sk` | Chabad Canva |

**Never use or change any DAAS account (Google admin@daascrm.app, GitHub daascrm, DAAS Supabase, the "DAAS" Stripe key) for this project.**

### Flow
1. `index.html` + `app.js` post the form (JSON, `text/plain`) to the Apps Script web app URL in `config.js`.
2. The script appends a row to the **Registrations** tab.
3. No donation: it emails the registrant a confirmation and emails the organizers.
4. Donation: it creates a Stripe Checkout session (live key in Script Properties `STRIPE_SECRET_KEY`), saves the session ID, and the page redirects to Stripe. Row = "Pending payment".
5. On return (`?paid=SESSION`) the page asks the script to verify with Stripe; a 10-minute time trigger (`checkPendingPayments`) also checks. Paid: row = "Paid", receipt number assigned, registrant gets confirmation + donation receipt, organizers notified. If the checkout expires (about 30 min): row = "Donation not completed", registrant still gets a confirmation.
6. No Stripe webhook is used.

Emails are sent by MailApp from rabbi@jewishchagrinfalls.com (name "Chabad at the Falls"), with BH and the Chabad logo (`images.squarespace-cdn.com/.../transparent+square.png`) at the top. Receipts show "Chabad at the Falls (EIN 87-4668165)" and "No goods or services were provided in exchange for this contribution."

### Sheet tabs
- **Registrations**: one row per submission. Tick "Added to DAAS" after entering the person in DAAS by hand (there is no DAAS integration, on purpose).
- **Settings** (edit here, no code change needed): Chabad party open (checkbox; unticking greys out the Chabad option on the site and shows "The Chanukah party at Chabad is full."), Chabad capacity (people, blank = no limit), Organizer email (comma-separated; currently simi@ and rabbi@jewishchagrinfalls.com), Organization name, EIN, Website (used for the Stripe return link; `https://menorahatthefalls.com`), Email sender name.
- **Summary**: registrations, total participants, Riverside count, Chabad count, donations paid, pending, not yet in DAAS.

## Content rules (from the organizer)
- Keep the page and form like last year's page (menorah.jewishchagrinfalls.com). Do not invent copy; reuse last year's wording, changing only date/performers.
- No emojis, no em dashes. No "powered by" credits. Footer links only to jewishchagrinfalls.com.
- Show the nightly Canva graphic instead of nightly schedule cards.
- Donation options (additive): Dreidel $36, Candle $54, Menorah $180, Flame $360, One night of nightly lightings $540, Menorah at the Falls co-sponsor $1,800, Other.
- Separate checkboxes for Riverside Park and the Chabad party.
- Sponsor line: "Sponsor: Step North & Kertesz Family Foundation".

## Files
- `index.html`, `app.js`, `config.js` (Apps Script URL), `style.css` (last year's compiled stylesheet), `extra.css` (additions), `CNAME`, `assets/`.
- `assets/menorah-flyer-2026.jpg`, `assets/nightly-lightings-2026.jpg`: web-sized exports. Full-size print files come from Canva.
- `apps-script/Code.gs`: copy of the backend. To change the backend: edit in the Apps Script editor, save, then Deploy > Manage deployments > Edit > Version: New version > Deploy (URL stays the same). Keep this copy in sync.

## Changing things
- Search/share preview: `<title>`, description and `og:`/`twitter:` tags at the top of `index.html`. Title "Chanukah in Chagrin Falls | Light up the night!". Share image is the menorah-crowd photo from jewishchagrinfalls.com (`whole.jpg` on images.squarespace-cdn.com); if it is removed from that site, point the tags at `assets/banner.jpg` instead. After changing, refresh the preview in Facebook's Sharing Debugger.
- Website text/images: edit files in this repo (GitHub web editor is fine). GitHub Pages republishes in about a minute.
- Graphics: edit in Canva, export, replace the two .jpg files in `assets/` (keep the names, keep them under about 1 MB).
- Switching Stripe keys: Apps Script > Project Settings > Script Properties > `STRIPE_SECRET_KEY`.

## DNS (Squarespace, menorahatthefalls.com)
A @ 185.199.108.153 / .109.153 / .110.153 / .111.153; AAAA @ 2606:50c0:8000::153 / 8001 / 8002 / 8003; CNAME www chabadchagrin.github.io.
Kept untouched: Squarespace Domain Connect CNAME and the Email Security TXT records (SPF -all, DMARC reject, DKIM) because the domain sends no email. Last year's forwarding to jewishchagrinfalls.com was removed.

## Status (November 6, 2026)
- Site live on https. GitHub HTTPS certificate issued and "Enforce HTTPS" ticked under Settings > Pages (http now redirects to https). Sheet's Website setting (Settings!B7) set to `https://menorahatthefalls.com`.
- Tested: registration without donation (row + emails), donation redirect to live Stripe Checkout. A real paid test is done by the organizer, then refunded in Stripe.
