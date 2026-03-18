"use client";

import { ConversationConfig, UserProfile, InterlocutorProfile, ConversationMode, StoredProfile } from "@/types";
import { useState, useEffect } from "react";
import { getApiBase } from "@/lib/backend";

function getApi(): string { return getApiBase(); }

// ── Perfiles predefinidos ───────────────────────────────────────────────────

const PRESET_USERS: { label: string; data: UserProfile }[] = [
  {
    label: "Alex — TEA nivel 1 (25 a.)",
    data: {
      name: "Alex",
      age: 25,
      condition: "Trastorno del Espectro Autista (TEA) nivel 1",
      communication_style:
        "Comunicación literal y directa. Evita metáforas y lenguaje figurado. Vocabulario sencillo. Frases cortas.",
      interests: "tecnología, naturaleza, música clásica",
      sensitivities: "ruido fuerte, cambios de rutina",
    },
  },
  {
    label: "Carla — TEA nivel 2 (17 a.)",
    data: {
      name: "Carla",
      age: 17,
      condition: "Trastorno del Espectro Autista (TEA) nivel 2",
      communication_style:
        "Comunicación muy concreta. Frases de 3-5 palabras. Usa pictogramas como apoyo. Necesita tiempo para procesar.",
      interests: "animales, dibujo, series de animación",
      sensitivities: "multitudes, texturas, contacto físico inesperado",
    },
  },
];

const PRESET_INTERLOCUTORS: { label: string; data: InterlocutorProfile }[] = [
  {
    label: "María — madre",
    data: {
      name: "María",
      relationship: "madre",
      communication_style:
        "Habla de forma natural y afectuosa. Usa frases sencillas. Es paciente y comprensiva.",
      context: "Conversación en casa después de cenar",
    },
  },
  {
    label: "Lucas — profesor de apoyo",
    data: {
      name: "Lucas",
      relationship: "profesor de apoyo",
      communication_style:
        "Habla pausado, con frases claras y estructuradas. Refuerza positivamente. Usa apoyos visuales cuando puede.",
      context: "Clase de apoyo en el aula de recursos",
    },
  },
];

interface Props {
  defaults: ConversationConfig;
  onStart: (config: ConversationConfig) => void;
  disabled?: boolean;
}

export default function ConfigForm({ defaults, onStart, disabled }: Props) {
  const [userProfile, setUserProfile] = useState<UserProfile>(defaults.user_profile);
  const [interlocutorProfile, setInterlocutorProfile] = useState<InterlocutorProfile>(
    defaults.interlocutor_profile
  );
  const [topic, setTopic] = useState(defaults.topic);
  const [maxTurns, setMaxTurns] = useState(defaults.max_turns);
  const [mode, setMode] = useState<ConversationMode>(defaults.mode);
  const [waitSeconds, setWaitSeconds] = useState(defaults.wait_seconds);

  // Clave del perfil seleccionado: "preset:N", "saved:ID" o "custom"
  const [selectedUser, setSelectedUser] = useState("preset:0");
  const [selectedInterlocutor, setSelectedInterlocutor] = useState("preset:0");

  // Perfiles guardados en backend
  const [savedUsers, setSavedUsers] = useState<StoredProfile[]>([]);
  const [savedInterlocutors, setSavedInterlocutors] = useState<StoredProfile[]>([]);

  const reloadSaved = () => {
    fetch(`${getApi()}/admin/profiles`)
      .then((r) => r.json())
      .then((list: StoredProfile[]) => {
        setSavedUsers(list.filter((p) => p.type === "user"));
        setSavedInterlocutors(list.filter((p) => p.type === "interlocutor"));
      })
      .catch(() => {});
  };

  useEffect(() => { reloadSaved(); }, []);

  const saveProfile = async (type: "user" | "interlocutor") => {
    const data = type === "user" ? userProfile : interlocutorProfile;
    const name = data.name;
    await fetch(`${getApi()}/admin/profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type, data }),
    });
    reloadSaved();
  };

  const applyUserPreset = (key: string) => {
    setSelectedUser(key);
    if (key.startsWith("preset:")) {
      const idx = parseInt(key.split(":")[1]);
      setUserProfile({ ...PRESET_USERS[idx].data });
    } else if (key.startsWith("saved:")) {
      const id = parseInt(key.split(":")[1]);
      const p = savedUsers.find((s) => s.id === id);
      if (p) setUserProfile({ ...(p.data as UserProfile) });
    }
  };

  const applyInterlocutorPreset = (key: string) => {
    setSelectedInterlocutor(key);
    if (key.startsWith("preset:")) {
      const idx = parseInt(key.split(":")[1]);
      setInterlocutorProfile({ ...PRESET_INTERLOCUTORS[idx].data });
    } else if (key.startsWith("saved:")) {
      const id = parseInt(key.split(":")[1]);
      const p = savedInterlocutors.find((s) => s.id === id);
      if (p) setInterlocutorProfile({ ...(p.data as InterlocutorProfile) });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStart({ user_profile: userProfile, interlocutor_profile: interlocutorProfile, topic, max_turns: maxTurns, mode, wait_seconds: waitSeconds });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── Contexto de la conversación ─────────────────────────────────── */}
      <section className="border border-blue-200 rounded-xl p-4 bg-blue-50/40 space-y-4">
        <h3 className="text-sm font-semibold text-blue-800">Contexto de la conversación</h3>

        <div>
          <label className="block text-xs font-medium text-gray-800 mb-1">Tema inicial</label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="p.ej. ¿Cómo fue tu día?"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-800 mb-1">
              Turnos máximos: <span className="text-blue-600 font-bold">{maxTurns}</span>
            </label>
            <input type="range" min={2} max={20} step={1} value={maxTurns}
              onChange={(e) => setMaxTurns(Number(e.target.value))}
              className="w-full accent-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-800 mb-1">
              Espera por turno:{" "}
              <span className={`font-bold ${mode === "real" ? "text-violet-600" : "text-blue-600"}`}>
                {waitSeconds} s
              </span>
            </label>
            <input type="range" min={1} max={30} step={1} value={waitSeconds}
              onChange={(e) => setWaitSeconds(Number(e.target.value))}
              className={`w-full ${mode === "real" ? "accent-violet-500" : "accent-blue-500"}`} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-800 mb-2">Modo</label>
          <div className="grid grid-cols-2 gap-3">
            {(["auto", "real"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`px-3 py-2.5 rounded-xl border-2 text-sm font-medium text-left transition-all ${
                  mode === m
                    ? m === "auto" ? "border-blue-500 bg-blue-50 text-blue-800" : "border-violet-500 bg-violet-50 text-violet-800"
                    : "border-gray-200 bg-white text-gray-800 hover:border-gray-300"
                }`}>
                <div className="font-semibold">{m === "auto" ? "🤖 Automático" : "🙋 Modo real"}</div>
                <div className="text-xs mt-0.5 opacity-70">
                  {m === "auto" ? "El LLM elige tras la cuenta atrás" : "El humano elige; el LLM actúa si no responde"}
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Usuario ─────────────────────────────────────────────────────── */}
      <ProfileSection
        title="Usuario"
        color="blue"
        selectValue={selectedUser}
        onSelectChange={applyUserPreset}
        onSave={() => saveProfile("user")}
        presets={PRESET_USERS.map((p, i) => ({ key: `preset:${i}`, label: p.label }))}
        saved={savedUsers.map((p) => ({ key: `saved:${p.id}`, label: `★ ${p.name}` }))}
      >
        <Field label="Nombre" value={userProfile.name}
          onChange={(v) => { setUserProfile({ ...userProfile, name: v }); setSelectedUser("custom"); }} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Edad" value={String(userProfile.age)} type="number"
            onChange={(v) => { setUserProfile({ ...userProfile, age: Number(v) }); setSelectedUser("custom"); }} />
          <Field label="Condición" value={userProfile.condition}
            onChange={(v) => { setUserProfile({ ...userProfile, condition: v }); setSelectedUser("custom"); }} />
        </div>
        <TextareaField label="Estilo comunicativo" value={userProfile.communication_style}
          onChange={(v) => { setUserProfile({ ...userProfile, communication_style: v }); setSelectedUser("custom"); }} />
        <Field label="Intereses" value={userProfile.interests}
          onChange={(v) => { setUserProfile({ ...userProfile, interests: v }); setSelectedUser("custom"); }} />
        <Field label="Sensibilidades" value={userProfile.sensitivities}
          onChange={(v) => { setUserProfile({ ...userProfile, sensitivities: v }); setSelectedUser("custom"); }} />
      </ProfileSection>

      {/* ── Interlocutor ────────────────────────────────────────────────── */}
      <ProfileSection
        title="Interlocutor"
        color="purple"
        selectValue={selectedInterlocutor}
        onSelectChange={applyInterlocutorPreset}
        onSave={() => saveProfile("interlocutor")}
        presets={PRESET_INTERLOCUTORS.map((p, i) => ({ key: `preset:${i}`, label: p.label }))}
        saved={savedInterlocutors.map((p) => ({ key: `saved:${p.id}`, label: `★ ${p.name}` }))}
      >
        <Field label="Nombre" value={interlocutorProfile.name}
          onChange={(v) => { setInterlocutorProfile({ ...interlocutorProfile, name: v }); setSelectedInterlocutor("custom"); }} />
        <Field label="Relación" value={interlocutorProfile.relationship}
          onChange={(v) => { setInterlocutorProfile({ ...interlocutorProfile, relationship: v }); setSelectedInterlocutor("custom"); }} />
        <TextareaField label="Estilo comunicativo" value={interlocutorProfile.communication_style}
          onChange={(v) => { setInterlocutorProfile({ ...interlocutorProfile, communication_style: v }); setSelectedInterlocutor("custom"); }} />
        <Field label="Contexto" value={interlocutorProfile.context}
          onChange={(v) => { setInterlocutorProfile({ ...interlocutorProfile, context: v }); setSelectedInterlocutor("custom"); }} />
      </ProfileSection>

      <button type="submit" disabled={disabled}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
          text-white font-semibold py-3 rounded-xl transition-colors">
        Iniciar conversación
      </button>
    </form>
  );
}

// ── Componentes auxiliares ──────────────────────────────────────────────────

interface ProfileSectionProps {
  title: string;
  color: "blue" | "purple";
  selectValue: string;
  onSelectChange: (key: string) => void;
  onSave: () => void;
  presets: { key: string; label: string }[];
  saved: { key: string; label: string }[];
  children: React.ReactNode;
}

function ProfileSection({ title, color, selectValue, onSelectChange, onSave, presets, saved, children }: ProfileSectionProps) {
  const [saved_, setSaved_] = useState(false);
  const border = color === "blue" ? "border-blue-200" : "border-purple-200";
  const legend = color === "blue" ? "text-blue-800" : "text-purple-800";
  const bg = color === "blue" ? "bg-blue-50/40" : "bg-purple-50/40";

  const handleSave = async () => {
    await onSave();
    setSaved_(true);
    setTimeout(() => setSaved_(false), 2000);
  };

  return (
    <section className={`border ${border} rounded-xl p-4 ${bg} space-y-3`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className={`text-sm font-semibold ${legend}`}>{title}</h3>
        <div className="flex items-center gap-2">
          <select
            value={selectValue}
            onChange={(e) => onSelectChange(e.target.value)}
            className={`text-sm text-gray-800 font-medium border ${border} rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 ${
              color === "blue" ? "focus:ring-blue-300" : "focus:ring-purple-300"
            } max-w-[180px]`}
          >
            <optgroup label="Predefinidos">
              {presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </optgroup>
            {saved.length > 0 && (
              <optgroup label="Guardados">
                {saved.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </optgroup>
            )}
            <option value="custom">✏️ Personalizado</option>
          </select>
          <button
            type="button"
            onClick={handleSave}
            className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all ${
              saved_
                ? "bg-green-100 border-green-300 text-green-700"
                : color === "blue"
                ? "bg-white border-blue-200 text-blue-700 hover:bg-blue-50"
                : "bg-white border-purple-200 text-purple-700 hover:bg-purple-50"
            }`}
          >
            {saved_ ? "✓ Guardado" : "Guardar"}
          </button>
        </div>
      </div>
      <div className="space-y-3 pt-1">
        {children}
      </div>
    </section>
  );
}

function Field({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-800 font-medium mb-0.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300" />
    </div>
  );
}

function TextareaField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-800 font-medium mb-0.5">{label}</label>
      <textarea value={value} rows={2} onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none" />
    </div>
  );
}
