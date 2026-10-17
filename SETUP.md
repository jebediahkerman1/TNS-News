# TNS News setup guide

TNS News uses GitHub Pages for the public website and Supabase Edge Functions/Database for submissions and review. New stories are screened by AI, stored as pending, and must be approved by an authorized editor before they become public. Editors can review in the website Editorial Desk or click YES/NO buttons in a private Discord moderation channel.

## 1. Website

GitHub Pages site: `https://jebediahkerman1.github.io/TNS-News/`

Private website Editorial Desk: `https://jebediahkerman1.github.io/TNS-News/admin.html`

## 2. Database and website editor

1. Open your Supabase project at `https://supabase.com/dashboard`.
2. Go to **SQL Editor → New query** and run the contents of `supabase/schema.sql`.
3. In **Authentication → Users**, create your editor account and copy its UUID.
4. In SQL Editor, grant the account editorial access:

```sql
insert into public.tns_admins (user_id)
values ('PASTE-YOUR-USER-UUID-HERE')
on conflict (user_id) do nothing;
```

5. Visit `admin.html` and sign in. Never put an admin password or service-role key in website JavaScript.

If the database already had a `stories` table before this schema was run, check for missing columns before deploying; `create table if not exists` does not migrate an older table automatically.

## 3. Create a Discord moderation bot

You only need Discord itself and your existing Supabase project; no separate notification service is needed.

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create an application named **TNS News Moderator**.
2. In **Bot**, create/reset the bot token and copy it somewhere private. Never publish it or commit it to GitHub.
3. In **General Information**, copy the **Application ID** and **Public Key**.
4. In the Discord server, create a private channel such as `#tns-story-review`. Give only trusted moderators access. Copy its channel ID (enable Developer Mode in Discord settings, then right-click the channel → Copy Channel ID).
5. Under the application’s **OAuth2 → URL Generator**, select the `bot` scope and the `Send Messages` and `Embed Links` permissions, then use the generated URL to add the bot to your server. Keep the review channel private.
6. Copy each moderator's Discord **User ID** (Developer Mode → right-click their profile → Copy User ID). Only IDs listed in the server secret `DISCORD_MODERATOR_IDS` may approve/reject stories.

## 4. Configure Supabase secrets

In Supabase **Edge Functions → Secrets** (or with the CLI), set these server-side secrets:

- `OPENAI_API_KEY` — your OpenAI API key for the existing AI moderation check.
- `DISCORD_BOT_TOKEN` — the bot token.
- `DISCORD_CHANNEL_ID` — ID of the private review channel.
- `DISCORD_APPLICATION_PUBLIC_KEY` — Public Key from the Discord Developer Portal.
- `DISCORD_MODERATOR_IDS` — comma-separated Discord user IDs allowed to decide, for example `111111111111111111,222222222222222222`.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — Supabase normally supplies these to Edge Functions. If they are missing, configure them as server-side secrets.

Do not add bot tokens, the service-role key, or the OpenAI key to `index.html`, `admin.html`, or any public GitHub file.

## 5. Deploy the Edge Functions

Install Node.js and the Supabase CLI, clone this repository, then run these commands from the local repository folder. Replace the project reference with your Supabase project's reference.

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set OPENAI_API_KEY=YOUR_OPENAI_API_KEY
supabase secrets set DISCORD_BOT_TOKEN=YOUR_DISCORD_BOT_TOKEN
supabase secrets set DISCORD_CHANNEL_ID=YOUR_DISCORD_CHANNEL_ID
supabase secrets set DISCORD_APPLICATION_PUBLIC_KEY=YOUR_DISCORD_PUBLIC_KEY
supabase secrets set DISCORD_MODERATOR_IDS=YOUR_DISCORD_USER_ID
supabase functions deploy submit-story --no-verify-jwt
supabase functions deploy discord-review --no-verify-jwt
```

If you have multiple moderators, put their IDs in one comma-separated value surrounded by quotes if your shell requires it. Supabase Edge Functions use the secrets configured in your project.

## 6. Connect Discord button interactions

After deploying `discord-review`, copy your Supabase project URL and set the Discord application's **Interactions Endpoint URL** under **General Information** to:

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/discord-review`

Discord will send a verification ping. The function verifies Discord's Ed25519 request signature and responds to the ping; the endpoint should validate successfully. If Discord cannot validate it, check the deployed function logs and confirm the application public key secret is correct.

## 7. What happens when a reader submits a story?

1. The `submit-story` Edge Function checks the headline and article text with OpenAI's moderation endpoint. Flagged text is rejected; if moderation is unavailable, the story is not saved.
2. A passing submission is saved in Supabase with status `pending`, so the public cannot see it.
3. The function sends a Discord embed to the private review channel with the headline, author, category, article text, optional image, and **YES — Publish** / **NO — Reject** buttons.
4. A button click is verified as a genuine Discord interaction. Only a Discord user whose ID is in `DISCORD_MODERATOR_IDS` can decide.
5. YES changes a pending story to `published`; NO changes it to `rejected`. The Discord message updates to show the decision and disables the buttons. A second click cannot change a story that is no longer pending.
6. The website Editorial Desk remains available as another way to review stories.

## Important notes

- AI moderation is a first safety filter, not fact-checking. Read the story and consider its claims, images, privacy, and whether satire is clearly labelled before publishing.
- Keep the Discord review channel private and grant decision permissions only to trusted people.
- The Discord message includes the article text so reviewers can read it before clicking. Very long article text is shortened to fit Discord's embed limits.
- If Discord isn't configured or Discord API requests fail, the story still stays pending in the database. Check Supabase Edge Function logs for details.
- This project is hosted on GitHub Pages, so server-side logic must run in Supabase Edge Functions; never attempt to hide bot secrets in browser code.
