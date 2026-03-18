import { ChatMessage } from "@/types";
import { useEffect, useLayoutEffect, useRef } from "react";
import PictogramStrip from "@/components/PictogramStrip";

interface Props {
  messages: ChatMessage[];
  interlocutorName: string;
  userName: string;
  pictogramsUser?: boolean;
  pictogramsInterlocutor?: boolean;
  scrollTrigger?: number;
}

export default function MessageList({ messages, interlocutorName, userName, pictogramsUser = false, pictogramsInterlocutor = false, scrollTrigger = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // Scroll inmediato tras cada mensaje o trigger
  useLayoutEffect(() => {
    scrollToBottom();
  }, [messages, scrollTrigger]);

  // Re-scroll cuando el contenedor se encoge (al aparecer el SuggestionPanel)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => scrollToBottom());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
      {messages.map((msg) => {
        const isUser = msg.role === "user";
        const isSystem = msg.role === "system";

        if (isSystem) {
          return (
            <div key={msg.id} className="flex justify-center">
              <span className="text-xs text-gray-700 bg-gray-100 px-3 py-1 rounded-full">
                {msg.content}
              </span>
            </div>
          );
        }

        const showPictograms = isUser ? pictogramsUser : pictogramsInterlocutor;

        return (
          <div
            key={msg.id}
            className={`flex ${isUser ? "justify-end" : "justify-start"}`}
          >
            <div
            className={`max-w-[85%] sm:max-w-[70%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
              <span className="text-xs text-gray-800 px-1">
                {isUser ? userName : interlocutorName}
              </span>
              <div
                className={`px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                  isUser
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-white text-gray-800 border border-gray-200 rounded-bl-sm"
                }`}
              >
                {msg.content}
              </div>
              <PictogramStrip text={msg.content} enabled={showPictograms} />
              {isUser && msg.chosenBy && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full self-end ${
                  msg.chosenBy === "human"
                    ? "bg-violet-100 text-violet-600"
                    : "bg-gray-100 text-gray-700"
                }`}>
                  {msg.chosenBy === "human" ? "elegido por ti" : "elegido por IA"}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
