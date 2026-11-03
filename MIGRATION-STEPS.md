# Moving the Board Site from Supabase to Netlify: Step-by-Step

**Who this is for:** the person doing the move. You do not need to know how to
code. Every step says where to click, what you should see, and what to do if
you see something else.

**Time needed:** about 1 hour, plus a short check the next day.

**The golden rule:** if anything looks different from what this guide says,
**stop and ask Scott** before going further. Nothing in Parts A and B affects
the live site, and Supabase is never changed, so stopping is always safe.

---

## What is changing (in plain words)

The board site (`board.harrisonfaith.church`) keeps its records in a database
service called **Supabase**. The code has been rewritten so the records live
with **Netlify**, the company that already hosts the site. After the move:

- The site looks and works the same for the board.
- Everyone signs in **once more**, the same way as before: type your email,
  then the 8-digit code that arrives by email.
- Documents attached to a motion can be up to **15 MB** each (it was 25 MB).
- Supabase can then be **paused**, which frees it for other projects.

You will move the records with a **button on a setup page**. You will not type
any commands.

---

## What you need before you start

- [ ] A **Netlify** login with access to the board site (Team Owner or Developer).
- [ ] A **GitHub** login with access to `scottbrandon-rgb/hfc-board-voting`.
- [ ] A **Resend** login (resend.com), the service that sends the site's email.
- [ ] Your own board email address, if you are on the board. Otherwise have
      Scott (the chair) nearby to sign in with his.
- [ ] A quiet time. Ask the board not to use the site for about an hour.

**Today's record counts** (from Supabase on 3 November 2026). You will
compare against these later:

| What            | Count |
| --------------- | ----- |
| Board members   | 6     |
| Motions         | 5     |
| Documents       | 5     |
| Voting lists    | 10    |
| Votes           | 15    |
| Comments        | 11    |
| History entries | 62    |
| PDF records     | 5     |

If the board has used the site since then, some numbers may be a little
higher. That is fine. They should never be lower.

---

## Part A: Pre-checks (10 minutes). Nothing changes yet.

### A1. Check that email sending works (this is critical)

After the move, sign-in codes are sent by Resend. If Resend is not set up,
**nobody can sign in.**

1. Go to **resend.com** and sign in.
2. Click **Domains** in the left menu.
3. Find **harrisonfaith.org**. Next to it, the status must say **Verified**.

✅ It says **Verified**: go on to A2.
❌ It is missing, or says Pending or Failed: **stop**. Tell Scott, "The Resend
domain is not verified." It needs records added at the church's domain
provider first.

### A2. Check the site's settings on Netlify

1. Go to **app.netlify.com** and sign in.
2. Click the board site in the list. It may be called something like
   `hfc-board-voting`, and it shows `board.harrisonfaith.church`.
3. In the left menu, click **Site configuration**, then **Environment variables**.
4. Check that each of these names is in the list. You do **not** need to
   look at or change their values.

| Name                        | Why it is needed                        |
| --------------------------- | --------------------------------------- |
| `RESEND_API_KEY`            | sends sign-in codes and notices         |
| `RESEND_FROM_EMAIL`         | the "from" address on emails            |
| `APP_URL`                   | the site's address, used in email links |
| `CRON_SECRET`               | protects the hourly background job      |
| `NEXT_PUBLIC_SUPABASE_URL`  | used **once** to copy the old records   |
| `SUPABASE_SERVICE_ROLE_KEY` | used **once** to copy the old records   |

✅ All six are there: go on to Part B.
❌ One is missing: **stop** and tell Scott which one.

---

## Part B: Try it on a practice copy (30 minutes). The live site is untouched.

Netlify can build a **preview**: a private practice copy of the new site at its
own web address, with its own empty database. You will copy the records into
the preview and check them there first.

### B1. Open the pull request

A "pull request" is GitHub's way of proposing a change.

1. Go to this address:
   **https://github.com/scottbrandon-rgb/hfc-board-voting/compare/main...claude/keen-bohr-k3g1fo**
2. Click the green **Create pull request** button.
3. Title: `Move the database to Netlify`. Click **Create pull request** again.

(If Scott has already opened it, open the **Pull requests** tab and click on it instead.)

### B2. Wait for the preview

1. Stay on the pull request page. Within a minute or two, a comment from
   **Netlify** appears that says the **Deploy Preview** is building.
2. Wait 3–5 minutes and refresh the page. The comment changes to say the
   Deploy Preview is **ready**, and shows a link that looks like
   `https://deploy-preview-5--<site-name>.netlify.app`.
3. Copy that link somewhere. This guide calls it **the preview link**.

❌ If the comment says the deploy **failed**: go to B3 and read the note there.

### B3. Check the database exists

1. In Netlify, open the board site.
2. In the left menu, click **Data & Storage**, then **Database**.

✅ You see a database with branches listed: go on to B4.
❌ It says there is no database:

1.  Click **Create a database manually**.
2.  Go to **Deploys** in the left menu, click the most recent **Deploy
    Preview**, then click **Retry deploy** (or **Retry**, then **Deploy site**).
3.  Wait for it to finish, then come back to this step.
4.  If it still fails, **stop** and tell Scott. Netlify shows a log of what
    went wrong; a screenshot of its last screen helps.

### B4. Copy the records into the preview

1. In your browser, go to **the preview link** with `/setup/import` added to
   the end. For example:
   `https://deploy-preview-5--<site-name>.netlify.app/setup/import`
2. You see a page titled **Move the board's records** with a blue button:
   **Copy the records from Supabase**.
3. Press the button **once**. It says "Copying…" for up to a minute.
4. It then says **"Done. The board's records are here."** with a list of counts.
5. Compare the counts with the table under "What you need before you start".
   _"Documents (records)" is the documents line, and "Document files copied"
   should match it._

✅ The counts match (or are a little higher) and there is **no red text**:
go on to B5.
❌ You see **red text**, or a count is lower: **stop**. Take a screenshot and
send it to Scott.

_This only reads from Supabase. Supabase is not changed, so it is safe._

### B5. Sign in on the preview

1. Click **sign in** (or go to the preview link with `/login` at the end).
2. Enter a board email address (yours, or have Scott use his).
3. Check that email. A message arrives from the board site with the subject
   **"Deacon Board sign-in code: ########"**. It may take a minute; check
   spam or junk too.
4. Type the 8-digit code.

✅ You are signed in and see the board's home page: email works. Go on to B6.
❌ No email after 5 minutes, or "We couldn't send a code": **stop** and tell
Scott. Resend is not working, and going live would lock everyone out.

### B6. Look around the preview

Check each of these:

- [ ] Open **Motions** and tap the **All** tab. The board's motions are listed (5 as of 3 November). _(The **Open** tab may be empty; no motion is in progress right now.)_
- [ ] Open a motion that has a document and tap the document. It opens.
- [ ] If you are signed in as the chair or the secretary: on a finished
      motion, **Official record (PDF)** downloads.
- [ ] The **Board** page (chair only) lists the members.

⚠️ **Do not publish, move, second or vote on anything in the preview.**
The preview sends real emails to the whole board.

### B7. Check the preview's health

Go to **the preview link** with `/api/health` added to the end. The page shows
a short line of text.

✅ It includes `"ok":true`: the practice run passed. Go on to Part C.
❌ It says `"ok":false`: **stop** and tell Scott.

---

## Part C: Go live (15 minutes)

Pick a quiet time. Between C1 and C3 (about 5 minutes), the board can't sign in.

### C1. Merge the pull request

1. Go back to the pull request on GitHub.
2. Scroll down and click the green **Merge pull request** button, then
   **Confirm merge**.

### C2. Wait for Netlify to publish it

1. In Netlify, click **Deploys** in the left menu.
2. The top entry says **Building**, then **Published** after 3–5 minutes.

✅ **Published**: go on to C3.
❌ **Failed**: the live site stays on the old version and keeps working with
Supabase, so nothing is broken. **Stop** and tell Scott.

### C3. Copy the records into the live site

This is the same as B4, on the real address:

1. Go to **https://board.harrisonfaith.church/setup/import**
2. Press **Copy the records from Supabase** **once**.
3. Wait for **"Done. The board's records are here."** and check the counts
   again, the same as in B4.

❌ If you see red text or wrong counts: **stop** and go to "If something goes
wrong" at the end.

### C4. Sign in and check

1. Go to **https://board.harrisonfaith.church** and sign in with the emailed code.
2. Repeat the checks from B6 on the live site.
3. Go to **https://board.harrisonfaith.church/api/health**. It must show
   `"ok":true`.

### C5. Tell the board

You can send something like:

> The board site has moved to a new home behind the scenes. Nothing changes in
> how you use it, but you'll need to sign in once more: open the site, enter
> your email, and type the 8-digit code we email you. If you added the site to
> your phone's home screen, it still works.

---

## Part D: Afterwards

### D1. The next day: check the hourly job

1. Netlify: the board site → **Logs** → **Functions** → `cron-background-jobs`.
2. You should see a run about every hour. Each one ends with `"ok":true`.

❌ If you see errors, tell Scott. The site still works, but closing votes at
the deadline and the reminder emails depend on this job.

### D2. After one to two weeks of normal use: pause Supabase

This frees the Supabase project for other uses. **Pause it. Do not delete it.**
Supabase keeps a paused project for 90 days, so it can be switched back on if
it is ever needed.

1. Go to **supabase.com/dashboard** and open the project **hfc-board-voting**.
2. Click **Project Settings** (the gear icon), then **General**.
3. Click **Pause project** and confirm.

### D3. After pausing: remove the old Supabase settings from Netlify

1. Netlify: the board site → **Site configuration** → **Environment variables**.
2. Delete each of these (click the name, then **Delete variable**):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (if it is there)
   - `SUPABASE_SERVICE_ROLE_KEY`

The setup page then shows a "settings are missing" note. That is expected: the
records have already been moved, and the page never runs again.

---

## If something goes wrong

**Before Part C:** nothing has changed on the live site. Stop, and tell Scott
what you saw.

**After Part C (going back to the old site):** this works as long as Supabase
has **not** been paused (D2).

1. Netlify: the board site → **Deploys**.
2. Scroll to the last deploy **from before** the merge. It is the one just
   below the top entry, published earlier.
3. Click it, then click **Publish deploy**.

The old site is back within a minute, with all its Supabase records, and the
old sign-in still works. Anything done on the new site after the move (new
votes or comments) is **not** in Supabase, so write those down for Scott.

**If a page shows "Something went wrong"** or a sign-in code never arrives,
note the time and what you clicked, and send it to Scott.
