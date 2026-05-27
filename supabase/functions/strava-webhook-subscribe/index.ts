// Manage Strava webhook subscription (one-time setup + status + delete).
// Protected by CLAUDE_ACCESS_KEY (?key=...) — same pattern as claude-activities.
//
// Endpoints (all via this single function):
//   GET  ?key=...&action=list      -> view current subscription(s)
//   POST ?key=...&action=create    -> create a subscription pointing to strava-webhook
//   POST ?key=...&action=delete&id=<sub_id> -> delete a subscription

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-admin-key, content-type",
};

function extractAdminKey(req: Request): string | null {
  const h = req.headers.get("x-admin-key");
  if (h) return h;
  const auth = req.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const accessKey = Deno.env.get("CLAUDE_ACCESS_KEY");
  const provided = extractAdminKey(req);
  if (!accessKey || !provided || provided !== accessKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const clientId = Deno.env.get("STRAVA_CLIENT_ID");
  const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET");
  const verifyToken = Deno.env.get("STRAVA_WEBHOOK_VERIFY_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!clientId || !clientSecret || !verifyToken || !supabaseUrl) {
    return new Response(JSON.stringify({ error: "Missing config" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const action = url.searchParams.get("action") || "list";
  const callbackUrl = `${supabaseUrl}/functions/v1/strava-webhook`;

  try {
    if (action === "list") {
      const res = await fetch(
        `https://www.strava.com/api/v3/push_subscriptions?client_id=${clientId}&client_secret=${encodeURIComponent(clientSecret)}`,
      );
      const data = await res.json();
      return new Response(JSON.stringify({ subscriptions: data, callback_url: callbackUrl }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create") {
      const form = new FormData();
      form.append("client_id", clientId);
      form.append("client_secret", clientSecret);
      form.append("callback_url", callbackUrl);
      form.append("verify_token", verifyToken);
      const res = await fetch("https://www.strava.com/api/v3/push_subscriptions", {
        method: "POST", body: form,
      });
      const data = await res.json();
      return new Response(JSON.stringify({ status: res.status, body: data, callback_url: callbackUrl }), {
        status: res.ok ? 200 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const id = url.searchParams.get("id");
      if (!id) return new Response(JSON.stringify({ error: "Missing id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      const res = await fetch(
        `https://www.strava.com/api/v3/push_subscriptions/${id}?client_id=${clientId}&client_secret=${encodeURIComponent(clientSecret)}`,
        { method: "DELETE" },
      );
      return new Response(JSON.stringify({ status: res.status, deleted: res.ok }), {
        status: res.ok ? 200 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Erreur" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
