// Supabase Edge Function: discord-review
// Set DISCORD_APPLICATION_PUBLIC_KEY, DISCORD_MODERATOR_IDS,
// SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY as server-side secrets.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fromHex(hex: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) throw new Error("Invalid hex");
  return new Uint8Array(hex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));
}

async function validDiscordSignature(req: Request, rawBody: string): Promise<boolean> {
  const publicKey = Deno.env.get("DISCORD_APPLICATION_PUBLIC_KEY");
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  if (!publicKey || !signature || !timestamp || !/^\d+$/.test(timestamp)) return false;
  const unixTimestamp = Number(timestamp);
  if (!Number.isFinite(unixTimestamp) || Math.abs(Date.now() / 1000 - unixTimestamp) > 300) return false;
  try {
    const key = await crypto.subtle.importKey("raw", fromHex(publicKey), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      fromHex(signature),
      new TextEncoder().encode(timestamp + rawBody),
    );
  } catch {
    return false;
  }
}

function componentResponse(content: string) {
  return {
    type: 7,
    data: {
      content,
      components: [{
        type: 1,
        components: [
          { type: 2, style: 3, label: "YES — Publish", custom_id: "tns:disabled:yes", disabled: true },
          { type: 2, style: 4, label: "NO — Reject", custom_id: "tns:disabled:no", disabled: true },
        ],
      }],
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const rawBody = await req.text();
  if (!await validDiscordSignature(req, rawBody)) return json({ error: "Invalid Discord request signature." }, 401);

  let interaction: Record<string, any>;
  try { interaction = JSON.parse(rawBody); }
  catch { return json({ error: "Invalid JSON." }, 400); }

  if (interaction.type === 1) return json({ type: 1 });
  if (interaction.type !== 3) return json({ type: 4, data: { content: "Unsupported interaction.", flags: 64 } });

  const userId = String(interaction.member?.user?.id ?? interaction.user?.id ?? "");
  const allowed = (Deno.env.get("DISCORD_MODERATOR_IDS") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (!userId || !allowed.includes(userId)) {
    return json({ type: 4, data: { content: "You are not authorized to review TNS News stories.", flags: 64 } });
  }

  const customId = String(interaction.data?.custom_id ?? "");
  const match = /^tns:(yes|no):([0-9a-f-]{36})$/i.exec(customId);
  if (!match) return json({ type: 4, data: { content: "This review button is invalid or has already been used.", flags: 64 } });

  const decision = match[1] === "yes" ? "published" : "rejected";
  const storyId = match[2];
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ type: 4, data: { content: "The review service is not configured. Contact the TNS site owner.", flags: 64 } });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase
    .from("stories")
    .update({ status: decision, reviewed_at: new Date().toISOString(), reviewed_by: null })
    .eq("id", storyId)
    .eq("status", "pending")
    .select("id,headline")
    .maybeSingle();

  if (error) {
    console.error("Discord story review database error", error);
    return json({ type: 4, data: { content: "Could not save your decision. Please try again or use the website Editorial Desk.", flags: 64 } });
  }
  if (!data) {
    return json(componentResponse("⚠️ This story has already been reviewed or no longer exists. It was not changed by this click."));
  }

  const message = decision === "published"
    ? "✅ **APPROVED AND PUBLISHED** by <@" + userId + ">\n**" + data.headline + "** is now visible on TNS News."
    : "❌ **STORY REJECTED** by <@" + userId + ">\n**" + data.headline + "** will remain hidden from the public.";
  return json(componentResponse(message));
});
