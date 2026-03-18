import { UserProfile, InterlocutorProfile } from "@/types";

interface Props {
  userProfile: UserProfile;
  interlocutorProfile: InterlocutorProfile;
  topic: string;
  maxTurns: number;
  turn: number;
  status: string;
}

export default function InfoPanel({
  userProfile,
  interlocutorProfile,
  topic,
  maxTurns,
  turn,
  status,
}: Props) {
  return (
    <div className="w-72 bg-white border-r border-gray-200 p-5 flex flex-col gap-5 overflow-y-auto">
      {/* Estado */}
      <div>
        <h3 className="text-xs uppercase tracking-wide text-gray-700 font-semibold mb-2">Estado</h3>
        <p className="text-sm text-gray-800">{status}</p>
        {maxTurns > 0 && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-gray-700 mb-1">
              <span>Turno {turn}</span>
              <span>/ {maxTurns}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min((turn / maxTurns) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tema */}
      <div>
        <h3 className="text-xs uppercase tracking-wide text-gray-700 font-semibold mb-2">Tema</h3>
        <p className="text-sm text-gray-800 italic">&ldquo;{topic}&rdquo;</p>
      </div>

      {/* Perfil usuario */}
      <div className="bg-blue-50 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🧑</span>
          <div>
            <p className="text-sm font-semibold text-blue-800">{userProfile.name}</p>
            <p className="text-xs text-blue-600">{userProfile.condition}</p>
          </div>
        </div>
        <p className="text-xs text-blue-700 mb-1">
          <span className="font-medium">Intereses:</span> {userProfile.interests}
        </p>
        <p className="text-xs text-blue-700">
          <span className="font-medium">Sensibilidades:</span> {userProfile.sensitivities}
        </p>
      </div>

      {/* Perfil interlocutor */}
      <div className="bg-purple-50 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">👤</span>
          <div>
            <p className="text-sm font-semibold text-purple-800">{interlocutorProfile.name}</p>
            <p className="text-xs text-purple-600">{interlocutorProfile.relationship}</p>
          </div>
        </div>
        <p className="text-xs text-purple-700">{interlocutorProfile.context}</p>
      </div>

      {/* Leyenda */}
      <div>
        <h3 className="text-xs uppercase tracking-wide text-gray-700 font-semibold mb-2">Leyenda</h3>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-white border-2 border-gray-300 inline-block" />
            <span className="text-xs text-gray-700">Interlocutor (LLM 1)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-600 inline-block" />
            <span className="text-xs text-gray-700">Usuario con TEA (LLM 3)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />
            <span className="text-xs text-gray-700">Sugerencias (LLM 2 — Gestor)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
