# Tavola 🍝

A small mobile-first web app for a friend group that eats lunches and dinners together. Someone cooks, and the group buys the groceries.

- **Plan meals.** Anyone ticks the lunches and dinners happening over the next 2 weeks. Each meal has a sign-up deadline.
- **Sign up.** The Meals tab opens on the next meal with one big button: "I'm in" before the deadline, "I'm eating" on the day, "I ate this" afterwards. Late changes are always allowed (with a warning). Forgot to log yesterday's meal? The home page asks "Ate dinner Wed?" with a one-tap button.
- **Usually in.** Tick "I'm usually in" on the Me page and you're signed up for every newly planned meal automatically (and for already-planned meals whose sign-up is still open). You only tap "Can't make it" when you won't be there. Leftover meals and the cook are never auto-signed up.
- **Notifications.** Turn them on from the Me page (or the nudge on the Meals tab) to get a push notification whenever someone plans meals: one per planning batch, never to the person who planned. "Usually in" people are told they're already in. On iPhone this needs Tavola added to the home screen first (iOS 16.4+). "Send me a test" on the Me page checks it works.
- **Scan to log.** Every meal page has a QR code (📷 section) to show at the table. Scanning it with a phone camera logs that person as eating the meal in one go, with an Undo. The QR goes through the invite link, so a phone that isn't in the group yet picks a name first and is then logged. Since it includes the invite, only show it to people at the table.
- **Cook view.** The cook marks herself as *cook* on the Me page and sees "Cook for N" for each meal (leftover meals don't need cooking, so they don't show it). She eats free and is never charged.
- **Split costs.** Whoever bought groceries adds the receipt total to the meal. It's split equally among the people who signed up. Remainder cents go to the earliest sign-ups, so shares always add up exactly.
- **Leftovers.** When one cook-up feeds more than one meal, open the original meal and mark a later lunch or dinner (up to 4 days later) as its leftovers. The later meal is created if it isn't planned yet. The original groceries are then split **per portion** across everyone who ate either meal: one portion per person per meal, so someone who eats both pays for two portions. Anything bought just for the leftover meal (bread, say) can be added there as an extra and is split among that meal's eaters only. Cancelled leftover meals don't count.
- **Pay.** Each person sees "Pay Alice €8.33", with:
  - a Revolut link
  - a SEPA (EPC/GiroCode) QR that most EU banking apps scan with the amount filled in
  - copy-IBAN as a fallback

  Tapping **I paid** records it right away. Payments are trust-based.
- **Money tab.** Everyone's public running balance, plus the fewest transfers needed to settle everything at once. This is the true minimum: the group is split into the most possible sets whose balances cancel out, and each set is settled separately. Exact for up to 15 people with a non-zero balance; above that it falls back to a fast near-optimal method.
- **People.** Tap anyone's name (Money tab or a meal) to see their Revolut and IBAN at any time, their balance, and a pay card if you owe them.
- **Feed.** Every change is logged, and payments and receipts can be undone from there. It's reached from the Money tab (the cook, who has no Money tab, gets it in the nav instead).
- **To do.** The home page reminds you about meals from the past week that still need a receipt, or that you ate but haven't rated.
- **Zorkasm ratings.** Once a meal has happened, everyone who isn't the cook can give it a 1–10 score and a review. The History tab shows every past meal, the averages and a hall of fame.
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
npm test               # money math (incl. leftovers), EPC QR and rating unit tests
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
   - Optional, for notifications: `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (generate with `npx web-push generate-vapid-keys`) and `VAPID_SUBJECT` (your app's https URL). Without them the app works and simply sends no notifications.
5. Deploy. The build runs the migrations, then builds the app.
6. Share `https://<your-app>.vercel.app/join/<GROUP_INVITE_TOKEN>` in the group chat.

## Layout

```
src/lib/ledger.ts      split / leftovers portions / balances / settle-up (pure, tested)
src/lib/leftovers.ts   which later meals can be marked as leftovers (tested)
src/lib/epc.ts         SEPA QR payload + IBAN validation (tested)
src/lib/session.ts     signed cookie (Web Crypto; used by middleware + server)
src/lib/push.ts        web push sending (never throws; skipped without VAPID keys)
public/sw.js           service worker: shows notifications and opens the meal when tapped
src/app/actions.ts     all writes (server actions); each one logs to the activity feed
src/app/eat/[id]/      QR target: logs "I ate here" for the scanning phone, then shows the meal
src/app/(app)/         Meals, meal detail, Plan, History, Money, Feed, Me pages
src/db/schema.ts       members (+ usually_in), meals (+ leftovers_of_id), signups, expenses, payments, ratings, push_subscriptions, activity
```
