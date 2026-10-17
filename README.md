# TNS News

A fictional news and satire website with a newspaper-inspired layout, sports scores, politics, business and gaming sections, plus a reader story submission form.

## Website
Enable GitHub Pages in **Settings → Pages** and publish from `main` / `/(root)`.

## Reader submissions and AI moderation
The submission form needs a Supabase project and the `submit-story` Edge Function. Follow [SETUP.md](SETUP.md) to configure the database, connect the public front end, and deploy the server-side OpenAI moderation function.

**Safety design:** text is checked by OpenAI's `omni-moderation-latest` endpoint. A flagged story is rejected; a story that passes is saved as `pending`, not automatically published. Editors should fact-check it and inspect image rights before setting its status to `published` in Supabase Table Editor.

Never store an OpenAI API key or Supabase service-role key in public front-end code. See [SETUP.md](SETUP.md) for setup and limitations.

TNS News is fictional; mark invented articles clearly as satire.
