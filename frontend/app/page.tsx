"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { getWsUrl } from "@/lib/backend";
import {
  ChatMessage,
  ConversationConfig,
  WsEvent,
  ConversationMode,
} from "@/types";
import MessageList from "@/components/MessageList";
import SuggestionPanel from "@/components/SuggestionPanel";
import ThinkingIndicator from "@/components/ThinkingIndicator";
import InfoPanel from "@/components/InfoPanel";
import ConfigForm from "@/components/ConfigForm";
import HealthCheck from "@/components/HealthCheck";

// URL del WebSocket resuelta dinámicamente (ver lib/backend.ts)

const DEFAULT_CONFIG: ConversationConfig = {
  topic: "¿Cómo fue tu día hoy?",
  max_turns: 8,
  mode: "real" as ConversationMode,
  wait_seconds: 10,
  pictograms: { interlocutor: true, user: true, suggestions: true },
  user_profile: {
    name: "Alex",
    age: 25,
    condition: "Trastorno del Espectro Autista (TEA) nivel 1",
    communication_style:
      "Comunicación literal y directa. Evita metáforas y lenguaje figurado. Vocabulario sencillo. Frases cortas.",
    interests: "tecnología, naturaleza, música clásica",
    sensitivities: "ruido fuerte, cambios de rutina",
  },
  interlocutor_profile: {
    name: "María",
    relationship: "madre",
    communication_style:
      "Habla de forma natural y afectuosa. Usa frases sencillas. Es paciente y comprensiva.",
    context: "Conversación en casa después de cenar",
  },
};

type AppStatus = "idle" | "connecting" | "running" | "done" | "error";

export default function Home() {
  const [appStatus, setAppStatus] = useState<AppStatus>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [thinking, setThinking] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("Sin conexión");
  const [currentTurn, setCurrentTurn] = useState(0);
  const [maxTurns, setMaxTurns] = useState(DEFAULT_CONFIG.max_turns);
  const [waitSeconds, setWaitSeconds] = useState(DEFAULT_CONFIG.wait_seconds);
  const [conversationMode, setConversationMode] = useState<ConversationMode>(DEFAULT_CONFIG.mode);
  const [config, setConfig] = useState<ConversationConfig>(DEFAULT_CONFIG);
  const [showConfig, setShowConfig] = useState(true);
  const [showInfoDrawer, setShowInfoDrawer] = useState(false);
  const [scrollRevision, setScrollRevision] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const manualChoiceCbRef = useRef<((idx: number) => void) | null>(null);
  const manualTypeCbRef = useRef<((text: string) => void) | null>(null);

  const addMessage = useCallback(
    (role: ChatMessage["role"], content: string, name: string, turn: number, selectedIndex?: number, chosenBy?: ChatMessage["chosenBy"]) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          role,
          content,
          name,
          turn,
          selectedIndex,
          chosenBy,
        },
      ]);
    },
    []
  );

  const handleWsEvent = useCallback(
    (event: WsEvent, cfg: ConversationConfig, ws: WebSocket) => {
      switch (event.type) {
        case "status":
          setAppStatus("running");
          setStatusText(event.content as string);
          if (event.wait_seconds) setWaitSeconds(event.wait_seconds);
          if (event.mode) setConversationMode(event.mode);
          break;
        case "thinking":
          setThinking(event.agent ?? "");
          break;
        case "interlocutor":
          setThinking(null);
          addMessage("interlocutor", event.content as string, cfg.interlocutor_profile.name, event.turn ?? 0);
          setCurrentTurn(event.turn ?? 0);
          break;
        case "suggestions":
          setThinking(null);
          setSuggestions(event.content as string[]);
          setScrollRevision((v) => v + 1);
          manualChoiceCbRef.current = (idx: number) => {
            ws.send(JSON.stringify({ action: "choose", index: idx }));
            manualChoiceCbRef.current = null;
            manualTypeCbRef.current = null;
            setSuggestions([]);
          };
          manualTypeCbRef.current = (text: string) => {
            ws.send(JSON.stringify({ action: "type", text }));
            manualChoiceCbRef.current = null;
            manualTypeCbRef.current = null;
            setSuggestions([]);
          };
          break;
        case "user":
          setSuggestions([]);
          manualChoiceCbRef.current = null;
          manualTypeCbRef.current = null;
          setThinking(null);
          addMessage("user", event.content as string, cfg.user_profile.name, event.turn ?? 0, event.selected_index, event.chosen_by);
          break;
        case "error":
          setAppStatus("error");
          setStatusText(`Error: ${event.content}`);
          setThinking(null);
          break;
        case "done":
          setAppStatus("done");
          setStatusText("Conversación finalizada");
          setThinking(null);
          setSuggestions([]);
          break;
      }
    },
    [addMessage]
  );

  const handleStart = useCallback(
    (cfg: ConversationConfig) => {
      setConfig(cfg);
      setMaxTurns(cfg.max_turns);
      setWaitSeconds(cfg.wait_seconds);
      setConversationMode(cfg.mode);
      setMessages([]);
      setSuggestions([]);
      setThinking(null);
      setCurrentTurn(0);
      setAppStatus("connecting");
      setShowConfig(false);

      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setStatusText("Conectado. Iniciando conversación…");
        ws.send(JSON.stringify(cfg));
      };
      ws.onmessage = (ev) => {
        const event: WsEvent = JSON.parse(ev.data);
        handleWsEvent(event, cfg, ws);
      };
      ws.onerror = () => {
        setAppStatus("error");
        setStatusText("Error de conexión con el backend");
      };
      ws.onclose = () => {
        setAppStatus((s) => (s === "running" ? "done" : s));
      };
    },
    [handleWsEvent]
  );

  const handleManualChoose = (idx: number) => manualChoiceCbRef.current?.(idx);
  const handleManualType = (text: string) => manualTypeCbRef.current?.(text);

  const handleStop = () => {
    wsRef.current?.close();
    setAppStatus("done");
    setStatusText("Conversación detenida");
    setSuggestions([]);
    setThinking(null);
  };

  const handleReset = () => {
    wsRef.current?.close();
    setAppStatus("idle");
    setMessages([]);
    setSuggestions([]);
    setThinking(null);
    setCurrentTurn(0);
    setStatusText("Sin conexión");
    setShowConfig(true);
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* Panel lateral izquierdo — solo escritorio */}
      {!showConfig && (
        <div className="hidden md:flex">
          <InfoPanel
            userProfile={config.user_profile}
            interlocutorProfile={config.interlocutor_profile}
            topic={config.topic}
            maxTurns={maxTurns}
            turn={currentTurn}
            status={statusText}
          />
        </div>
      )}

      {/* Drawer móvil del InfoPanel */}
      {showInfoDrawer && !showConfig && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowInfoDrawer(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-white h-full overflow-y-auto shadow-xl flex flex-col">
            <button
              onClick={() => setShowInfoDrawer(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-xl leading-none"
            >
              ✕
            </button>
            <InfoPanel
              userProfile={config.user_profile}
              interlocutorProfile={config.interlocutor_profile}
              topic={config.topic}
              maxTurns={maxTurns}
              turn={currentTurn}
              status={statusText}
            />
          </div>
        </div>
      )}

      {/* Área central */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-3 md:px-6 py-3 md:py-4 flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">CAA</span>
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-800">Chat CAA</h1>
              <p className="hidden md:block text-xs text-gray-400">Comunicación Aumentativa y Alternativa</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              appStatus === "running" ? "bg-green-100 text-green-700" :
              appStatus === "error" ? "bg-red-100 text-red-700" :
              appStatus === "done" ? "bg-gray-100 text-gray-600" :
              "bg-yellow-100 text-yellow-700"
            }`}>
              {appStatus === "running" ? "En curso" :
               appStatus === "done" ? "Finalizado" :
               appStatus === "error" ? "Error" :
               appStatus === "connecting" ? "Conectando…" : "Inactivo"}
            </span>
            {appStatus === "running" && (
              <button onClick={handleStop}
                className="text-xs px-2.5 md:px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors">
                Detener
              </button>
            )}
            {(appStatus === "done" || appStatus === "error") && (
              <button onClick={handleReset}
                className="text-xs px-2.5 md:px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors">
                Nueva sesión
              </button>
            )}
            {!showConfig && (
              <button
                onClick={() => setShowInfoDrawer(true)}
                className="md:hidden text-xs px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                title="Ver información de sesión"
              >
                ℹ
              </button>
            )}
            <Link href="/admin"
              className="text-xs px-2.5 md:px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors hidden sm:inline-flex">
              Admin
            </Link>
          </div>
        </header>

        {/* Barra compacta de progreso — solo móvil, solo en conversación */}
        {!showConfig && (
          <div className="md:hidden bg-white border-b border-gray-100 px-3 py-1.5 flex items-center justify-between shrink-0">
            <span className="text-xs text-gray-600">
              <span className="font-medium text-blue-700">{config.user_profile.name}</span>
              <span className="mx-1 text-gray-400">↔</span>
              <span className="font-medium text-purple-700">{config.interlocutor_profile.name}</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Turno {currentTurn}/{maxTurns}</span>
              <div className="w-16 bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((currentTurn / maxTurns) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Cuerpo */}
        {showConfig ? (
          <div className="flex-1 overflow-y-auto py-10 px-4">
            <div className="w-full max-w-xl mx-auto">
              <div className="mb-6 text-center">
                <h2 className="text-xl font-bold text-gray-800 mb-1">Configurar conversación</h2>
                <p className="text-sm text-gray-500">
                  Ajusta los perfiles y el modelo simulará una conversación con sugerencias de CAA
                </p>
              </div>
              <div className="mb-4">
                <HealthCheck />
              </div>
              <ConfigForm defaults={DEFAULT_CONFIG} onStart={handleStart} disabled={appStatus === "connecting"} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            <MessageList
              messages={messages}
              interlocutorName={config.interlocutor_profile.name}
              userName={config.user_profile.name}
              pictogramsUser={config.pictograms?.user}
              pictogramsInterlocutor={config.pictograms?.interlocutor}
              scrollTrigger={scrollRevision}
            />
            {thinking && <ThinkingIndicator agent={thinking} />}
            <SuggestionPanel
              suggestions={suggestions}
              onChoose={handleManualChoose}
              onType={handleManualType}
              disabled={appStatus !== "running"}
              waitSeconds={waitSeconds}
              mode={conversationMode}
              pictograms={config.pictograms?.suggestions}
            />
          </div>
        )}
      </div>
    </div>
  );
}
