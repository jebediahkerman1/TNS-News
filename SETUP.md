# TNS News setup guide

The public GitHub Pages website accepts reader submissions. Supabase stores them, and the existing `submit-story` Edge Function checks headline/article text with OpenAI's moderation API. Passing AI checks does **not** publish a story: a human editor must read it and approve it in the private Editorial Desk.

## 1. Publish the site

In the GitHub repository, open **Settings → Pages** and choose **Deploy from a branch**, branch `main`, folder `/(root)`. The public site should be:

`https://jebediahkerman1.github.io/TNS-News/`

The private review dashboard is:

`https://jebediahkerman1.github.io/TNS-News/admin.html`

## 2. Set up the Supabase database

1. Open your Supabase project: `https://supabase.com/dashboard`.
2. Go to **SQL Editor → New query**.
3. Copy the complete contents of `supabase/schema.sql` into the editor and run it.
4. The schema makes published stories readable by the public, while only explicitly authorized editor accounts can read pending stories or change story status.

If you have already created a stories table, inspect it before running migrations. The SQL uses `create table if not exists`, so it does not automatically add missing columns to an older table.

## 3. Create your private editor account

1. In Supabase, open **Authentication → Users → Add user** and create an account with your email and a strong password. Enable email confirmation if you prefer; follow the project's auth settings.
2. Copy the new user's UUID from the Users table.
3. Return to **SQL Editor** and run this statement, replacing the example UUID with your own user's UUID:

```sql
insert into public.tns_admins (user_id)
values ('PASTE-YOUR-USER-UUID-HERE')
on conflict (user_id) do nothing;
```

Only grant this access to accounts you personally trust. Do not put an admin password or service-role key in the website.

Then visit `https://jebediahkerman1.github.io/TNS-News/admin.html` and sign in. You can read full pending stories, inspect the optional image, then select **Approve & Publish** or **Reject Story**. The dashboard checks for new pending stories every 15 seconds while open.

## 4. Enable AI moderation for submissions

The browser must never contain your OpenAI API key or Supabase service-role key. The existing Edge Function keeps those secrets on the server.

From a terminal with Node.js and the Supabase CLI installed, in a local clone of this repository run:

```sh
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase secrets set OPENAI_API_KEY=YOUR_OPENAI_API_KEY
supabase functions deploy submit-story --no-verify-jwt
```

Get your OpenAI API key from `https://platform.openai.com/api-keys` and keep it private. Supabase normally provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. If the function reports missing secrets, configure them as server-side function secrets in the Supabase dashboard. Never paste the service-role key into `index.html` or `admin.html`.

The frontend uses a public Supabase publishable key, which is designed for browser use. Keep database access safe with the row-level security policies in `supabase/schema.sql`.

## 5. How review and notifications work

1. A reader submits a headline and article text.
2. The server-side AI moderation check rejects text it flags; if the moderation service is unavailable, the submission is not saved.
3. If it passes, the story is saved as `pending`, invisible to public readers.
4. The editor signs in at `admin.html`, reads the full story and checks the image and factual claims.
5. **Approve & Publish** changes the story to `published`; **Reject Story** keeps it hidden.
6. With the Editorial Desk open, the queue refreshes every 15 seconds. Click **Enable Browser Alerts** to allow native browser notifications for newly submitted stories.

## Important limitations

- This is an in-browser system, not a third-party notification app. Browser pop-up notifications require permission and generally only work while the Editorial Desk page remains open. They are not guaranteed when the browser is closed or the PC is off.
- AI moderation is a safety filter, not fact-checking. Always read the story before publishing. It does not scan images, verify image rights, or reliably determine whether satire is misleading.
- Public submissions can be abused. Before widely promoting the form, add stronger rate limiting and abuse prevention such as CAPTCHA, and publish a privacy/contact policy.
- TNS News is a fictional news/satire project. Clearly label invented content so readers do not mistake it for real reporting.
