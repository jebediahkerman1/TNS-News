// Deploy as Supabase Edge Function: submit-story
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional Discord notification secrets: DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID
// This version does NOT use the OpenAI API. It validates submissions and leaves
// every accepted story pending for a human editor to review.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const categories = new Set([
  "World", "Politics", "Business", "Sports", "Technology",
  "Gaming", "Local", "Opinion",
]);

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

async function notifyDiscord(story: {
  id: string;
  author: string;
  category: string;
  headline: string;
  body: string;
  image_url: string | null;
}) {
  const token = Deno.env.get("DISCORD_BOT_TOKEN");
  const channelId = Deno.env.get("DISCORD_CHANNEL_ID");
  if (!token || !channelId) return;

  const snippet = story.body.length > 3200 ? story.body.slice(0, 3190) + "…" : story.body;
  const components = [{
    type: 1,
    components: [
      { type: 2, style: 3, label: "YES — Publish", custom_id: "tns:yes:" + story.id },
      { type: 2, style: 4, label: "NO — Reject", custom_id: "tns:no:" + story.id },
    ],
  }];

  const payload: Record<string, unknown> = {
    content: "📰 **TNS NEWS — STORY NEEDS YOUR REVIEW**\nRead the submission below, then choose YES to publish or NO to reject. Only authorized reviewers can decide.",
    embeds: [{
      title: story.headline.slice(0, 256),
      description: "**Category:** " + story.category + "\n**Submitted by:** " + story.author + "\n\n" + snippet,
      color: 15158332,
      ...(story.image_url ? { image: { url: story.image_url } } : {}),
      footer: { text: "TNS News • Automated checks are not AI moderation or fact-checking • Story ID: " + story.id },
    }],
    components,
    allowed_mentions: { parse: [] },
  };

  const response = await fetch(
    "https://discord.com/api/v10/channels/" + encodeURIComponent(channelId) + "/messages",
    {
      method: "POST",
      headers: { "Authorization": "Bot " + token, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    console.error("Discord notification failed with status", response.status, await response.text());
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "Use POST to submit a story." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret.");
    return reply(503, { error: "The story submission service is not configured yet." });
  }

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return reply(400, { error: "Please send a valid form submission." });
  }

  const author = typeof input.author === "string" ? input.author.trim() : "";
  const category = typeof input.category === "string" ? input.category : "";
  const headline = typeof input.headline === "string" ? input.headline.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  const imageUrl = typeof input.image_url === "string" && input.image_url.trim()
    ? input.image_url.trim()
    : null;

  if (author.length < 1 || author.length > 60) {
    return reply(400, { error: "Name must be between 1 and 60 characters." });
  }
  if (!categories.has(category)) return reply(400, { error: "Choose a valid story category." });
  if (headline.length < 5 || headline.length > 120) {
    return reply(400, { error: "Headline must be 5–120 characters." });
  }
  if (body.length < 40 || body.length > 10000) {
    return reply(400, { error: "Story text must be 40–10,000 characters." });
  }
  if (imageUrl) {
    try {
      const url = new URL(imageUrl);
      if (url.protocol !== "https:") throw new Error("https required");
    } catch {
      return reply(400, { error: "Image links must be valid HTTPS URLs." });
    }
  }

  // Basic anti-spam checks only; these are not AI moderation and cannot reliably
  // identify harmful content, misinformation, or nuanced context.
  const combinedText = headline + "\n" + body;
  const urlCount = (combinedText.match(/https?:\/\//gi) ?? []).length;
  if (urlCount > 5) {
    return reply(422, {
      error: "This submission contains too many links. Please reduce the number of links and try again.",
      moderation: "basic_filter",
    });
  }

  const normalizedBody = body.toLowerCase().replace(/\s+/g, " ").trim();
  const words = normalizedBody.split(" ");
  if (words.length >= 40 && new Set(words).size / words.length < 0.2) {
    return reply(422, {
      error: "This submission looks repetitive or spam-like. Please revise it and try again.",
      moderation: "basic_filter",
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: story, error } = await supabase.from("stories").insert({
    author,
    category,
    headline,
    body,
    image_url: imageUrl,
    status: "pending",
    moderation_flagged: false,
    moderation_categories: {
      basic_validation_passed: true,
      basic_spam_checks_passed: true,
      openai_moderation_used: false,
    },
  }).select("id,author,category,headline,body,image_url").single();

  if (error || !story) {
    console.error("Could not save story submission", error);
    return reply(500, { error: "Your story passed the basic checks, but could not be saved. Please try again later." });
  }

  try {
    await notifyDiscord(story);
  } catch (error) {
    console.error("Discord notification failed", error);
  }

  return reply(201, {
    ok: true,
    message: "Your story passed basic validation and is waiting for a human editor to review it. Automated checks are not AI moderation or fact-checking.",
    status: "pending",
    moderation: "basic_checks_only",
  });
});
