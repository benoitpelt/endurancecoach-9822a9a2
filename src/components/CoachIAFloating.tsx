import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Activity, Calendar, Loader2, Send, X } from "lucide-react";
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
  const [input, setInput] = useState("");
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !user || context) return;
    setLoadingCtx(true);
    supabase.functions
      .invoke("coach-ia-chat", { body: { action: "context" } })
      .then(({ data, error }) => {
        if (error) {
          toast.error("Impossible de charger ton contexte.");
        } else {
          setContext(data);
        }
      })
      .finally(() => setLoadingCtx(false));
  }, [open, user, context]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  if (!user || HIDDEN_ROUTES.includes(location.pathname)) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
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
      setMessages([...next, { role: "assistant", content: data.reply ?? "" }]);
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur du coach IA");
      setMessages(next);
    } finally {
      setSending(false);
    }
  };

  const saveToPlan = async (idx: number, content: string) => {
    if (!user) return;
    setSavingIdx(idx);
    try {
      const today = new Date().toISOString().slice(0, 10);
      // Find active plan + the week containing today
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

      // Detect sport from header line
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </Button>
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
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground",
                    )}
                  >
                    {m.content}
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
