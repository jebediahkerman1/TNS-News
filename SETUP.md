# TNS News setup guide

The GitHub Pages site is the public front end. Reader submissions use a Supabase database and Edge Function, which calls OpenAI's Moderation API on the server. **Do not put your OpenAI API key or Supabase service-role key in index.html.**

## 1. Publish the site on GitHub Pages

1. Open the TNS-News repository on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch **main** and folder **/(root)**, then Save.
5. Wait a few minutes. The site URL should be `https://YOUR-GITHUB-USERNAME.github.io/TNS-News/`.

## 2. Create a Supabase project

1. Create a project at https://supabase.com/dashboard.
2. Open **SQL Editor → New query**.
3. Copy all of `supabase/schema.sql` into the editor and run it.
4. In **Project Settings → API** (or **Connect**), copy the Project URL and the legacy anon key (a public key intended for browser use). These two values are intended for the browser.

## 3. Connect the front end

In `index.html`, find these lines near the bottom:

```js
const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";
```

Set them to your Supabase Project URL and **legacy anon key (a public key intended for browser use)**, for example:

```js
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_LEGACY_ANON_KEY";
```

Commit the change to GitHub. Never paste a service-role key into the website.

## 4. Deploy the secure AI moderation function

You need Node.js and the Supabase CLI on your computer. Open a terminal in a folder where you have cloned this repository, then run:

```sh
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase secrets set OPENAI_API_KEY=YOUR_OPENAI_API_KEY
supabase functions deploy submit-story --no-verify-jwt
```

Get your OpenAI API key from https://platform.openai.com/api-keys. Keep it private. Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions by default; if your project setup does not, set them as function secrets in the Supabase dashboard. Never expose the service-role key to visitors.

If you have not cloned the repository yet, use GitHub's **Code → Download ZIP**, unzip it, open a terminal in that folder, and run the Supabase CLI commands above. The Supabase CLI docs are at https://supabase.com/docs/guides/cli.

## 5. How submissions work

1. A reader fills out **Submit a Story**.
2. The Edge Function validates the fields and sends the headline and article text to OpenAI's `omni-moderation-latest` moderation endpoint.
3. If the moderation endpoint flags the text, the submission is rejected. If moderation is unavailable, the submission fails closed and is not saved.
4. If it passes, the story is saved with status `pending`. It is **not published automatically**.
5. Open Supabase **Table Editor → stories**. Review pending stories, verify claims and image rights, then change the `status` cell to `published` to publish or `rejected` to reject. Published stories appear on the website when it refreshes.

The public website can only read rows marked `published`. Public visitors cannot insert or change database rows directly; the server-side function handles submissions.

## Important safety notes

- AI moderation is an initial safety filter, not a fact-checker and not a guarantee. Human editorial review is required before publishing.
- This version checks headline and story text. It does not scan the optional image URL; inspect any image and its rights before publication.
- The function is deployed without JWT verification because reader submissions are public. It includes basic input validation but is an early version without full account verification, CAPTCHA, or production-grade per-IP rate limiting. Before widely promoting submissions, add abuse prevention (for example, CAPTCHA and rate limiting) and establish a privacy/contact policy.
- The site content is a fictional news/satire project. Label fictional content clearly so readers do not mistake invented stories for real reporting.
