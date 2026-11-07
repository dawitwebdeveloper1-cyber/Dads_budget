# Budget

A simple budgeting app for Dad. He types money coming in and going out, and
the app tells him where he stands. It works offline, keeps everything on his
phone, and installs on the iPhone home screen like a normal app.

**Stages 1 and 2 of 3 are built:**

- Stage 1: adding, editing and deleting entries; categories and folders; the
  Home, Breakdown and History screens; all the "no maths mistakes" rules, with
  automated tests.
- Stage 2: "Paid" ticks on upcoming bills (with Undo); a confirm card before
  every save; "Show me how" on every total; gentle notes (going short, a bill
  due soon, spending more or less than last month), which can be swiped away
  or turned off; and a list of all regular bills and pay under More.

---

## The tools, in plain words

- **Plain HTML, CSS and JavaScript, with no frameworks.** The files in this folder
  are exactly what runs on the phone. There's nothing to build or install, and
  nothing that can break because some library changed.
- **Saved on the phone only.** There's no account and no server. Apple doesn't
  clear storage for apps added to the home screen.
- **Works offline.** The first time it opens with internet, the phone keeps a copy
  of every file (that's what `sw.js` does).
- **Free hosting on GitHub Pages.** GitHub serves the files; your dad's data
  never goes there.
- **Tests use Node's built-in test runner.** Node is already on your computer.

## How the maths stays correct

| Rule | How |
|---|---|
| Money in cents | Every amount is a whole number of cents. Dollars only appear on screen. |
| Exact conversions | Weekly × 52, every 2 weeks × 26, monthly × 12 gives an exact yearly amount. That's divided by 365 / 52 / 12 and rounded once. |
| Pieces add up | When categories are rounded for display, the leftover cent goes to the right one, so the pieces always add up exactly to the total shown. |
| Cross-checks | Month totals are added up 3 ways (entry by entry, by category, payment by payment). Carry-over is worked out 2 ways. Breakdown checks that day/week/month/year agree. If anything disagrees, it recalculates once, then shows a warning instead of a number. |
| Real dates | Weekly bills land 5 times in some months and every-2-weeks pay lands 3 times. Bills due on the 31st land on the 30th or 28th/29th in shorter months. Leap years are handled. |
| Typo checks | No letters, blanks, negatives or $0. "Are you sure?" pops up if an amount is 5× bigger or 10× smaller than usual for that name, or $10,000+ the first time. |
| Duplicates | Warns if the same bill is already in the list, or the same amount and name is entered within 3 days. |
| History stays true | If a bill amount really changes, he picks "It changed from this month on", and earlier months keep the old amount. Deleting a bill that already counted in earlier months offers "Stop it after this month". |

Run the tests:

```bash
npm test
```

## Try it on this computer

```bash
npm start
```

Then open http://localhost:8080. Changes you make to the files show up after a
refresh. The offline copy can hide changes; in Chrome, DevTools → Application →
"Update on reload" fixes that.

---

## Put it online for free (GitHub Pages)

You only do this once.

1. Make a free account at https://github.com if you don't have one.
2. Click **+** (top right) → **New repository**.
   - Name: `dads-budget`
   - Choose **Public**. Free GitHub Pages needs that. Only the app's code is
     public; Dad's numbers never leave his phone.
   - Don't add a README. Click **Create repository**.
3. In a terminal on this computer, run these one at a time (put your
   GitHub username in place of `YOUR-USERNAME`):

   ```bash
   cd C:\Users\Ddawi\dads-budget
   ```
   ```bash
   git init
   ```
   ```bash
   git add .
   ```
   ```bash
   git commit -m "Budget app, stage 1"
   ```
   ```bash
   git branch -M main
   ```
   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/dads-budget.git
   ```
   ```bash
   git push -u origin main
   ```
4. On GitHub, open the repository → **Settings** → **Pages** (left side).
   Under **Build and deployment**, set **Source** to **Deploy from a branch**,
   **Branch** to `main` and folder `/ (root)`. Click **Save**.
5. Wait a minute or two, then refresh that page. It shows your link:
   `https://YOUR-USERNAME.github.io/dads-budget/`

## Put it on Dad's iPhone

1. On his iPhone, open **Safari** (it has to be Safari) and go to the link above.
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**. If you see an **Open as Web App**
   switch, leave it on. Tap **Add**.
4. A **Budget** icon appears on his home screen. From now on he opens it from
   there. It opens full-screen, with no Safari bars, and works without internet.

**Important:** the app's data lives inside that home-screen icon. **Deleting the
icon deletes his data.** The Export / Import backup buttons arrive in Stage 3;
until then, treat Stage 1 as a test run.

## Sending him an update later

1. Make your changes and run `npm test` (everything must pass).
2. Open `sw.js` and raise `VERSION` by one (for example `1` → `2`). This tells
   phones there's a new version.
3. Push it:
   ```bash
   git add .
   ```
   ```bash
   git commit -m "Describe the change"
   ```
   ```bash
   git push
   ```
4. On his phone, open the app once with internet, close it fully (swipe it
   away), and open it again.

## Adding the Mileage tab later

1. Make `js/screens/mileage.js` the same way as the other screens: an object
   with `id`, `label`, `icon` and a `render(ctx)` function.
2. Add it to the list in `js/tabs.js`.
3. Add the new file to the list in `sw.js` (a test checks you didn't forget).

## Where things are

```
js/maths/     all calculations (no screen code), fully tested
js/data/      the saved data and every change that can be made to it
js/screens/   one file per tab: home, breakdown, history, more
js/ui/        the add/edit form, pop-ups, shared pieces
tests/        the automated tests
sw.js         the offline copy
```
