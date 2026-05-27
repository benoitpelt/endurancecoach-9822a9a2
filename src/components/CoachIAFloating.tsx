import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Activity, Calendar, Loader2, PenSquare, Send, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const HIDDEN_ROUTES = ["/", "/login", "/signup"];

const WELCOME =
  "Bonjour ! Dis-moi comment tu te sens aujourd'hui, le temps que tu as, et tes contraintes — je te prépare une séance adaptée.";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export default function CoachIAFloating() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [loadingCtx, setLoadingCtx] = useState(false);
  const [sending, setSending] = useState(false);
  const [context, setContext] = useState<any>(null);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: WELCOME },
  ]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [pendingBriefing, setPendingBriefing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // External trigger: open drawer + queue weekly briefing
  useEffect(() => {
    const handler = () => {
      setOpen(true);
      setPendingBriefing(true);
    };
    window.addEventListener("coach-ia:auto-briefing", handler as EventListener);
    return () => window.removeEventListener("coach-ia:auto-briefing", handler as EventListener);
  }, []);

  // Load context + last 20 messages on first open
  useEffect(() => {
    if (!open || !user) return;
    if (!context) {
      setLoadingCtx(true);
      supabase.functions
        .invoke("coach-ia-chat", { body: { action: "context" } })
        .then(({ data, error }) => {
          if (error) toast.error("Impossible de charger ton contexte.");
          else setContext(data);
        })
        .finally(() => setLoadingCtx(false));
    }
    if (!historyLoaded) {
      supabase
        .from("coach_conversations")
        .select("role, content, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20)
        .then(({ data, error }) => {
          if (!error && data && data.length > 0) {
            const ordered = data
              .slice()
              .reverse()
              .map((m: any) => ({ role: m.role, content: m.content })) as Msg[];
            setMessages([{ role: "assistant", content: WELCOME }, ...ordered]);
          }
          setHistoryLoaded(true);
        });
    }
  }, [open, user, context, historyLoaded]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  

  const runMessage = async (text: string, opts?: { hidden?: boolean }) => {
    if (!text || sending || !user) return;
    const hidden = !!opts?.hidden;
    const userMsg: Msg = { role: "user", content: text };
    const next: Msg[] = [...messages, userMsg];
    if (!hidden) setMessages(next);
    setSending(true);
    try {
      const nowStr = new Date().toLocaleDateString("fr-FR", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const { data, error } = await supabase.functions.invoke("coach-ia-chat", {
        body: {
          action: "chat",
          messages: next.filter((m) => m.content !== WELCOME),
          context,
          now: nowStr,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const reply = data.reply ?? "";
      const assistantMsg: Msg = { role: "assistant", content: reply };
      if (hidden) {
        // Don't display the hidden user prompt — only the assistant reply
        setMessages([...messages, assistantMsg]);
      } else {
        setMessages([...next, assistantMsg]);
      }

      // Persist both messages so the conversation memory stays consistent
      await supabase.from("coach_conversations").insert([
        { user_id: user.id, role: "user", content: text },
        { user_id: user.id, role: "assistant", content: reply },
      ]);
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur du coach IA");
      if (!hidden) setMessages(messages);
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await runMessage(text);
  };

  // Auto-trigger the weekly briefing once context is loaded
  useEffect(() => {
    if (!pendingBriefing || !context || sending || loadingCtx || !user) return;
    setPendingBriefing(false);

    (async () => {
      const tsb = context?.load?.tsb;
      const tsbStr = typeof tsb === "number" ? `${tsb}` : "non disponible";

      // Compute Monday→Sunday window for the current week
      const today = new Date();
      const dow = (today.getDay() + 6) % 7; // 0 = Monday
      const monday = new Date(today);
      monday.setDate(today.getDate() - dow);
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      const todayIso = today.toISOString().slice(0, 10);
      const mondayIso = monday.toISOString().slice(0, 10);
      const sundayIso = sunday.toISOString().slice(0, 10);

      const fmtDay = (d: string | Date) =>
        new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });

      // Realised sessions (Strava-matched) for the current week
      const { data: completed } = await supabase
        .from("completed_workouts")
        .select(
          "sport_type, start_date, duration_seconds, moving_time_seconds, conformity_status, matching_status, activity_name",
        )
        .eq("user_id", user.id)
        .neq("matching_status", "unmatched")
        .gte("start_date", monday.toISOString())
        .lte("start_date", sunday.toISOString())
        .order("start_date", { ascending: true });

      const seances_realisees =
        completed && completed.length
          ? completed
              .map((c: any) => {
                const sec = c.moving_time_seconds || c.duration_seconds || 0;
                const min = Math.round(sec / 60);
                return `- ${fmtDay(c.start_date)} · ${c.sport_type} · ${min} min · conformité: ${c.conformity_status ?? "n/a"}`;
              })
              .join("\n")
          : "Aucune séance réalisée";

      // Planned sessions from today through Sunday
      const { data: planned } = await supabase
        .from("planned_workouts")
        .select(
          "sport_type, scheduled_date, session_goal, intensity_zone_label, duration_target_minutes",
        )
        .eq("user_id", user.id)
        .gte("scheduled_date", todayIso)
        .lte("scheduled_date", sundayIso)
        .order("scheduled_date", { ascending: true });

      const seances_prevues =
        planned && planned.length
          ? planned
              .map(
                (p: any) =>
                  `- ${fmtDay(p.scheduled_date)} · ${p.sport_type} · ${p.session_goal ?? p.intensity_zone_label ?? "séance"} · ${p.duration_target_minutes ?? "?"} min`,
              )
              .join("\n")
          : "Aucune séance prévue d'ici dimanche";

      const prompt = `L'utilisateur consulte sa semaine d'entraînement (du ${mondayIso} au ${sundayIso}). Génère automatiquement un briefing de cette semaine sans attendre qu'il écrive quoi que ce soit.

RÉALISÉ cette semaine (jours passés) :
${seances_realisees}
— Source : activités Strava réelles via completed_workouts

PRÉVU (aujourd'hui et jours restants) :
${seances_prevues}
— Source : planned_workouts

Pour les jours passés, base ton analyse uniquement sur ce qui a été réellement fait (RÉALISÉ ci-dessus), pas sur ce qui était prévu. Mentionne si une séance n'a pas été faite ou a été modifiée par rapport au plan (conformity_status). Pour les jours à venir, base-toi sur le plan prévu.

Le briefing doit répondre à ces questions en langage naturel, conversationnel, sans jargon technique :
1. Quel est l'objectif de cette semaine dans le plan ?
2. Pourquoi ces séances dans cet ordre ?
3. Quelle est la séance la plus importante et pourquoi ?
4. À quoi faire attention compte tenu de l'état de forme actuel (TSB : ${tsbStr}) ?
5. Un conseil concret pour bien aborder cette semaine.

Ton ton doit être celui d'un coach qui parle à son athlète — direct, encourageant, précis. Maximum 200 mots.`;

      runMessage(prompt, { hidden: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingBriefing, context, sending, loadingCtx, user]);

  if (!user || HIDDEN_ROUTES.includes(location.pathname)) return null;

  const newConversation = () => {
    setMessages([{ role: "assistant", content: WELCOME }]);
    setInput("");
  };

  const saveToPlan = async (idx: number, content: string) => {
    if (!user) return;
    setSavingIdx(idx);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: plan } = await supabase
        .from("training_plans")
        .select("id, training_blocks(id, training_weeks(id, start_date, end_date))")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let weekId: string | null = null;
      const blocks = (plan as any)?.training_blocks ?? [];
      for (const b of blocks) {
        for (const w of b.training_weeks ?? []) {
          if (w.start_date && w.end_date && today >= w.start_date && today <= w.end_date) {
            weekId = w.id;
            break;
          }
        }
        if (weekId) break;
      }
      if (!weekId) {
        toast.error("Aucune semaine active trouvée dans ton plan.");
        return;
      }

      const header = content.split("\n").find((l) => l.includes("SÉANCE")) ?? "";
      const lower = header.toLowerCase();
      const sport = lower.includes("nat") || lower.includes("swim")
        ? "swim"
        : lower.includes("vélo") || lower.includes("velo") || lower.includes("bike") || lower.includes("cycl")
        ? "bike"
        : "run";

      const { error } = await supabase.from("planned_workouts").insert({
        user_id: user.id,
        week_id: weekId,
        sport_type: sport,
        scheduled_date: today,
        status: "planned",
        created_by_type: "coach_ia",
        session_goal: "Séance proposée par le Coach IA",
        structure_text: content,
        workout_priority: "important",
      });
      if (error) throw error;
      toast.success("Séance enregistrée dans le plan");
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur d'enregistrement");
    } finally {
      setSavingIdx(null);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        aria-label="Coach IA"
        className="fixed bottom-20 right-4 z-50 h-14 w-14 rounded-full shadow-elevated bg-gradient-hero text-primary-foreground hover:opacity-90"
        size="icon"
      >
        <Activity className="h-6 w-6" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[400px] p-0 flex flex-col"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="font-heading text-lg font-semibold">Coach du jour</h2>
              <p className="text-xs text-muted-foreground">
                {loadingCtx ? "Chargement du contexte…" : "Prêt à t'accompagner"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={newConversation}
                aria-label="Nouvelle conversation"
                title="Nouvelle conversation"
              >
                <PenSquare className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div ref={scrollRef} className="px-4 py-4 space-y-3">
              {loadingCtx && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Récupération de ton plan et de tes activités…
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex flex-col",
                    m.role === "user" ? "items-end" : "items-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground whitespace-pre-wrap"
                        : "bg-secondary text-secondary-foreground prose prose-sm max-w-none",
                    )}
                  >
                    {m.role === "user" ? (
                      m.content
                    ) : (
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    )}
                  </div>
                  {m.role === "assistant" && i > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={savingIdx === i}
                      onClick={() => saveToPlan(i, m.content)}
                    >
                      {savingIdx === i ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Calendar className="mr-1 h-3 w-3" />
                      )}
                      Enregistrer dans le plan
                    </Button>
                  )}
                </div>
              ))}
              {sending && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Le coach réfléchit…
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="border-t p-3 flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Comment te sens-tu aujourd'hui ?"
              rows={2}
              className="resize-none"
              disabled={loadingCtx || sending}
            />
            <Button
              onClick={send}
              disabled={loadingCtx || sending || !input.trim()}
              size="icon"
              aria-label="Envoyer"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
