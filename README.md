# Tavola 🍝

A small mobile-first web app for a friend group that eats lunches and dinners together. Someone cooks, and the group buys the groceries.

- **Plan meals.** Anyone ticks the lunches and dinners happening over the next 2 weeks. Each meal has a sign-up deadline.
- **Sign up.** One tap: "I'm in". Late changes are still allowed after the deadline (with a warning).
- **Cook view.** The cook marks herself as *cook* on the Me page and sees "Cook for N" for each meal. She eats free and is never charged.
- **Split costs.** Whoever bought groceries adds the receipt total to the meal. It's split equally among the people who signed up. Remainder cents go to the earliest sign-ups, so shares always add up exactly.
- **Pay.** Each person sees "Pay Alice €8.33", with:
  - a Revolut link
  - a SEPA (EPC/GiroCode) QR that most EU banking apps scan with the amount filled in
  - copy-IBAN as a fallback

  Tapping **I paid** records it right away. Payments are trust-based.
- **Money tab.** Everyone's public running balance, plus the fewest transfers needed to settle everything at once.
- **Feed.** Every change is logged, and payments and receipts can be undone from there.
- **Guests.** They open the same invite link, tick "I'm a guest", and pay their own share.

## How login works

There are no accounts or passwords. Share `https://<app>/join/<GROUP_INVITE_TOKEN>`. Whoever opens it picks their name (or creates one), and the phone remembers them for about a year.

To rotate the link, change `GROUP_INVITE_TOKEN`. That logs everyone out, and they re-open the new link and pick their name again.

## Stack

- Next.js 15 (App Router, server actions)
- Tailwind 4
- Drizzle ORM on Postgres
  - Production: Neon
  - Local: embedded PGlite in `.data/`, created and migrated automatically. No Docker needed.

Balances are **never stored**. They're derived from expenses and payments in `src/lib/ledger.ts`, which is pure and unit-tested.

## Develop

```bash
npm install
npm run dev            # http://localhost:3000/join/dev  (dev invite token is "dev")
npm test               # money math + EPC QR unit tests
npm run lint && npx tsc --noEmit
```

Schema changes: edit `src/db/schema.ts`, then run `npm run db:generate` to create a migration in `drizzle/`. The local DB applies migrations on the next start. Production applies them during `npm run build`.

## Deploy (free: Vercel + Neon)

1. Push this repo to GitHub.
2. In Vercel, use **Add New → Project** and import the repo.
3. In the Vercel project, go to **Storage → Create → Neon Postgres**. This sets `DATABASE_URL`.
4. Add these environment variables:
   - `GROUP_INVITE_TOKEN`: a long random string. It becomes the secret part of the invite link.
   - `SESSION_SECRET`: generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
5. Deploy. The build runs the migrations, then builds the app.
6. Share `https://<your-app>.vercel.app/join/<GROUP_INVITE_TOKEN>` in the group chat.

## Layout

```
src/lib/ledger.ts      split / balances / settle-up (pure, tested)
src/lib/epc.ts         SEPA QR payload + IBAN validation (tested)
src/lib/session.ts     signed cookie (Web Crypto; used by middleware + server)
src/app/actions.ts     all writes (server actions); each one logs to the activity feed
src/app/(app)/         Meals, meal detail, Plan, Money, Feed, Me pages
src/db/schema.ts       members, meals, signups, expenses, payments, activity
```
