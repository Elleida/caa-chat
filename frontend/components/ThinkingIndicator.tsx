interface Props {
  agent: string;
}

const agentLabels: Record<string, string> = {
  interlocutor: "El interlocutor está escribiendo",
  gestor: "Generando sugerencias",
  user: "Eligiendo respuesta",
};

export default function ThinkingIndicator({ agent }: Props) {
  const label = agentLabels[agent] ?? "Procesando";

  return (
    <div className="flex justify-start px-4 py-2">
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-2 shadow-sm">
        <span className="text-xs text-gray-700">{label}</span>
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
