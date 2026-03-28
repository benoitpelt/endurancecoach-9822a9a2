import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Non autorisé");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const stravaClientId = Deno.env.get("STRAVA_CLIENT_ID");
    const stravaClientSecret = Deno.env.get("STRAVA_CLIENT_SECRET");

    if (!stravaClientId || !stravaClientSecret) {
      throw new Error("Configuration Strava manquante.");
    }

    const body = await req.json();
    const { action, code } = body;

    const supabase = createClient(supabaseUrl, serviceKey);

    if (action === "get_client_id") {
      return new Response(JSON.stringify({ client_id: stravaClientId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) throw new Error("Non autorisé");
    if (userErr || !user) throw new Error("Non autorisé");

    const body = await req.json();
    const { action, code } = body;

    const supabase = createClient(supabaseUrl, serviceKey);

    if (action === "exchange") {
      // Exchange authorization code for tokens
      if (!code) throw new Error("Code d'autorisation manquant.");

      const tokenRes = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: stravaClientId,
          client_secret: stravaClientSecret,
          code,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error("Strava token error:", errText);
        throw new Error("Impossible de se connecter à Strava. Réessaie.");
      }

      const tokenData = await tokenRes.json();
      const { access_token, refresh_token, expires_at, athlete } = tokenData;

      // Upsert strava connection
      const { error: upsertErr } = await supabase
        .from("strava_connections")
        .upsert({
          user_id: user.id,
          strava_athlete_id: athlete?.id || null,
          access_token,
          refresh_token,
          token_expires_at: new Date(expires_at * 1000).toISOString(),
          connected_at: new Date().toISOString(),
          import_status: "none",
        }, { onConflict: "user_id" });

      if (upsertErr) throw upsertErr;

      return new Response(JSON.stringify({
        success: true,
        athlete_name: athlete ? `${athlete.firstname} ${athlete.lastname}` : null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "disconnect") {
      // Delete connection and imported activities
      await supabase.from("imported_activities").delete().eq("user_id", user.id);
      await supabase.from("strava_connections").delete().eq("user_id", user.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "status") {
      const { data: conn } = await supabase
        .from("strava_connections")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      return new Response(JSON.stringify({
        connected: !!conn,
        connection: conn ? {
          connected_at: conn.connected_at,
          import_status: conn.import_status,
          last_import_at: conn.last_import_at,
          import_activity_count: conn.import_activity_count,
          strava_athlete_id: conn.strava_athlete_id,
        } : null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "refresh_token") {
      // Refresh access token if expired
      const { data: conn } = await supabase
        .from("strava_connections")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!conn) throw new Error("Aucune connexion Strava trouvée.");

      const now = new Date();
      const expiresAt = new Date(conn.token_expires_at);
      
      if (expiresAt > now) {
        return new Response(JSON.stringify({ access_token: conn.access_token }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const refreshRes = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: stravaClientId,
          client_secret: stravaClientSecret,
          refresh_token: conn.refresh_token,
          grant_type: "refresh_token",
        }),
      });

      if (!refreshRes.ok) throw new Error("Impossible de rafraîchir le token Strava.");

      const refreshData = await refreshRes.json();
      await supabase.from("strava_connections").update({
        access_token: refreshData.access_token,
        refresh_token: refreshData.refresh_token,
        token_expires_at: new Date(refreshData.expires_at * 1000).toISOString(),
      }).eq("user_id", user.id);

      return new Response(JSON.stringify({ access_token: refreshData.access_token }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      throw new Error("Action non reconnue.");
    }

  } catch (err: any) {
    console.error("strava-auth error:", err);
    return new Response(JSON.stringify({ error: err.message || "Erreur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
