"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MessageCircle, Mic, MicOff, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/* Tipado mínimo del Web Speech API (no está en lib.dom) */
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type SpeechResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

function getSpeechRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | undefined;
  return Ctor ? new Ctor() : null;
}

export function ChatFloat() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error, regenerate } = useChat();
  const busy = status === "submitted" || status === "streaming";

  // Refresca los datos de la página cuando la IA termina (puede haber escrito
  // en la DB) — también si acaba en error: las tools pueden haber corrido antes
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current === "streaming" && status !== "streaming") {
      router.refresh();
    }
    prevStatus.current = status;
  }, [status, router]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // En escritorio el panel va acoplado a la derecha y el contenido se
  // estrecha en vez de quedar tapado: el layout lee este atributo
  useEffect(() => {
    document.documentElement.toggleAttribute("data-chat-open", open);
    return () => document.documentElement.removeAttribute("data-chat-open");
  }, [open]);

  function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    sendMessage({ text: t });
    setInput("");
  }

  function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = getSpeechRecognition();
    if (!rec) return;
    recRef.current = rec;
    finalTranscriptRef.current = "";
    rec.lang = "es-ES";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      finalTranscriptRef.current = final;
      setInput(final + interim);
    };
    rec.onend = () => {
      setListening(false);
      // Se transcribe y se envía solo: hablar, soltar y listo
      const text = finalTranscriptRef.current.trim();
      if (text) {
        send(text);
      }
    };
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }

  const hasSpeech = typeof window !== "undefined" && !!getSpeechRecognition();

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Abrir asistente"
        className={cn(
          "fixed bottom-20 right-4 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 lg:bottom-6 lg:right-6",
          open && "hidden"
        )}
      >
        <MessageCircle className="size-6" />
      </button>

      {/* Panel de chat */}
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[75dvh] w-full max-w-lg flex-col rounded-t-2xl border bg-background shadow-2xl lg:inset-y-0 lg:left-auto lg:right-0 lg:h-auto lg:w-[400px] lg:max-w-none lg:rounded-none lg:border-y-0 lg:border-r-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="font-semibold">Asistente 💶</p>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <X className="size-5" />
            </Button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <p>Pregúntame o dime qué apuntar:</p>
                <p className="italic">«Añade 45 euros de la farmacia»</p>
                <p className="italic">«¿Cuánto llevamos gastado en comida?»</p>
                <p className="italic">«El gas sube a 80 euros al mes»</p>
              </div>
            )}
            <div className="flex flex-col gap-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                    m.role === "user"
                      ? "self-end bg-primary text-primary-foreground"
                      : "self-start bg-muted"
                  )}
                >
                  {m.parts.map((part, i) => {
                    if (part.type === "text")
                      // El texto del asistente llega en Markdown (negritas,
                      // listas, tablas); el del usuario se muestra tal cual
                      return m.role === "assistant" ? (
                        <div key={i} className="chat-md">
                          <Markdown remarkPlugins={[remarkGfm]}>
                            {part.text}
                          </Markdown>
                        </div>
                      ) : (
                        <span key={i}>{part.text}</span>
                      );
                    if (part.type.startsWith("tool-"))
                      return (
                        <span
                          key={i}
                          className="block text-xs italic opacity-60"
                        >
                          ⚙ {part.type.replace("tool-", "")}…
                        </span>
                      );
                    return null;
                  })}
                </div>
              ))}
              {busy && (
                <div className="self-start rounded-2xl bg-muted px-3 py-2 text-sm animate-pulse">
                  …
                </div>
              )}
              {status === "error" && (
                <div className="self-start rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <p>No he podido responder{error?.message ? ` (${error.message})` : ""}.</p>
                  <button
                    type="button"
                    onClick={() => regenerate()}
                    className="mt-1 font-medium underline underline-offset-2"
                  >
                    Reintentar
                  </button>
                </div>
              )}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            {hasSpeech && (
              <Button
                type="button"
                variant={listening ? "destructive" : "outline"}
                size="icon"
                onClick={toggleMic}
                aria-label={listening ? "Parar micrófono" : "Hablar"}
              >
                {listening ? (
                  <MicOff className="size-5" />
                ) : (
                  <Mic className="size-5" />
                )}
              </Button>
            )}
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? "Escuchando…" : "Escribe o habla…"}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={busy || !input.trim()}>
              <Send className="size-5" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
