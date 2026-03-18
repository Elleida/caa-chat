import { ChatMessage } from "@/types";
import { useEffect, useRef } from "react";

interface Props {
  messages: ChatMessage[];
  interlocutorName: string;
  userName: string;
}

export default function MessageList({ messages, interlocutorName, userName }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
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

        return (
          <div
            key={msg.id}
            className={`flex ${isUser ? "justify-end" : "justify-start"}`}
          >
            <div className={`max-w-[70%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
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
      <div ref={bottomRef} />
    </div>
  );
}
