"use client";

import { SessionSummary, SessionDetail, StoredProfile, UserProfile, InterlocutorProfile } from "@/types";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiBase } from "@/lib/backend";

function getApi(): string { return getApiBase(); }

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "—";

const modeLabel = (m: string) =>
  m === "real" ? "🙋 Modo real" : "🤖 Automático";

// ──────────────────────────────────────────────────────────────────────────────
// Página de administración
// ──────────────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [tab, setTab] = useState<"sessions" | "profiles">("sessions");

  return (
    <div className="h-screen flex flex-col bg-gray-50 font-sans overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xs text-blue-600 hover:underline">← Volver al chat</Link>
          <span className="text-gray-300">|</span>
          <h1 className="text-base font-semibold text-gray-800">Panel de Administración — CAA</h1>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white px-6 shrink-0">
        <div className="flex gap-6">
          {(["sessions", "profiles"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-700 hover:text-gray-900"
              }`}
            >
              {t === "sessions" ? "Conversaciones" : "Perfiles guardados"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === "sessions" ? <SessionsTab /> : <ProfilesTab />}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab: Conversaciones
// ──────────────────────────────────────────────────────────────────────────────
function SessionsTab() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const api = getApi();
    fetch(`${api}/admin/sessions`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { setSessions(d); setLoading(false); })
      .catch((e) => { setError(`No se pudo conectar con ${api}: ${e.message}`); setLoading(false); });
  }, []);

  const loadDetail = async (id: string) => {
    const r = await fetch(`${getApi()}/admin/sessions/${id}/turns`);
    const d = await r.json();
    setSelected(d);
  };

  if (loading) return <p className="text-sm text-gray-700">Cargando sesiones…</p>;
  if (error) return <p className="text-sm text-red-500 bg-red-50 rounded-lg p-3">{error}</p>;
  if (sessions.length === 0) return <p className="text-sm text-gray-700">No hay conversaciones guardadas aún.</p>;

  if (selected) {
    return <SessionDetailView detail={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="space-y-3 max-w-4xl">
      {sessions.map((s) => (
        <div
          key={s.id}
          onClick={() => loadDetail(s.id)}
          className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 truncate">{s.topic}</p>
              <p className="text-xs text-gray-700 mt-0.5">
                {s.user_name} ↔ {s.interlocutor_name} · {modeLabel(s.mode)} · {s.turn_count}/{s.max_turns} turnos · espera {s.wait_seconds}s
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-gray-700">{fmt(s.started_at)}</p>
              <p className={`text-xs mt-0.5 font-medium ${s.ended_at ? "text-gray-600" : "text-green-600"}`}>
                {s.ended_at ? "Finalizada" : "En curso"}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Detalle de sesión
// ──────────────────────────────────────────────────────────────────────────────
function SessionDetailView({ detail, onBack }: { detail: SessionDetail; onBack: () => void }) {
  const { session, turns } = detail;
  const humanPct = turns.length
    ? Math.round((turns.filter((t) => t.chosen_by === "human").length / turns.length) * 100)
    : 0;

  return (
    <div className="max-w-3xl space-y-6">
      <button onClick={onBack} className="text-sm text-blue-600 hover:underline">← Volver a la lista</button>

      {/* Cabecera de sesión */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-800 text-lg mb-3">{session.topic}</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Info label="Modo" value={modeLabel(session.mode)} />
          <Info label="Turnos" value={`${session.turn_count} / ${session.max_turns}`} />
          <Info label="Espera por turno" value={`${session.wait_seconds} s`} />
          <Info label="Inicio" value={fmt(session.started_at)} />
          <Info label="Fin" value={fmt(session.ended_at)} />
          <Info label="Elecciones humanas" value={`${humanPct}% (${turns.filter(t => t.chosen_by==="human").length}/${turns.length})`} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <ProfileCard title="Usuario" name={session.user_profile.name} data={session.user_profile} />
          <ProfileCard title="Interlocutor" name={session.interlocutor_profile.name} data={session.interlocutor_profile} />
        </div>
      </div>

      {/* Turnos */}
      <div className="space-y-4">
        {turns.map((t) => (
          <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-700 uppercase">Turno {t.turn_number + 1}</span>
              <span className="text-xs text-gray-700">{fmt(t.created_at)}</span>
            </div>

            {/* Interlocutor */}
            <div className="mb-3">
              <p className="text-xs text-purple-600 font-semibold mb-1">Interlocutor</p>
              <p className="text-sm text-gray-800 bg-purple-50 rounded-lg px-3 py-2">{t.interlocutor_msg}</p>
            </div>

            {/* Sugerencias */}
            <div className="mb-3">
              <p className="text-xs text-gray-700 font-semibold mb-1 uppercase">3 sugerencias del gestor</p>
              <div className="space-y-1.5">
                {[t.suggestion_0, t.suggestion_1, t.suggestion_2].map((s, i) => (
                  <div
                    key={i}
                    className={`text-sm px-3 py-2 rounded-lg border ${
                      t.chosen_index === i
                        ? "border-blue-400 bg-blue-50 text-blue-800 font-medium"
                        : "border-gray-100 bg-gray-50 text-gray-800"
                    }`}
                  >
                    <span className="text-xs opacity-50 mr-2">{i + 1}.</span>
                    {s}
                    {t.chosen_index === i && (
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                        t.chosen_by === "human"
                          ? "bg-violet-100 text-violet-700"
                          : "bg-gray-200 text-gray-700"
                      }`}>
                        {t.chosen_by === "human" ? "✓ elegida por humano" : "✓ elegida por IA"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-gray-700">{label}</span>
      <p className="text-sm text-gray-800 font-medium">{value}</p>
    </div>
  );
}

function ProfileCard({ title, name, data }: { title: string; name: string; data: UserProfile | InterlocutorProfile }) {
  const entries = Object.entries(data as unknown as Record<string, unknown>).filter(([k]) => k !== "name");
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-700 uppercase font-semibold mb-1">{title}</p>
      <p className="text-sm font-semibold text-gray-800">{name}</p>
      {entries.map(([k, v]) => (
        <p key={k} className="text-xs text-gray-700 mt-0.5">
          <span className="font-medium">{k}:</span> {String(v)}
        </p>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab: Perfiles guardados
// ──────────────────────────────────────────────────────────────────────────────
function ProfilesTab() {
  const [profiles, setProfiles] = useState<StoredProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"user" | "interlocutor">("user");
  const [formName, setFormName] = useState("");
  const [formData, setFormData] = useState<Record<string, string>>({});

  const reload = () => {
    setLoading(true);
    fetch(`${getApi()}/admin/profiles`)
      .then((r) => r.json())
      .then((d) => { setProfiles(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const startCreate = (type: "user" | "interlocutor") => {
    setEditingId(null);
    setFormType(type);
    setFormName("");
    setFormData(
      type === "user"
        ? { name: "", age: "25", condition: "", communication_style: "", interests: "", sensitivities: "" }
        : { name: "", relationship: "", communication_style: "", context: "" }
    );
    setShowForm(true);
  };

  const startEdit = (p: StoredProfile) => {
    setEditingId(p.id);
    setFormType(p.type);
    setFormName(p.name);
    setFormData(Object.fromEntries(Object.entries(p.data).map(([k, v]) => [k, String(v)])));
    setShowForm(true);
  };

  const handleSave = async () => {
    const data = formType === "user"
      ? { ...formData, age: Number(formData.age) } as unknown as UserProfile
      : formData as unknown as InterlocutorProfile;

    if (editingId !== null) {
      await fetch(`${getApi()}/admin/profiles/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName, data }),
      });
    } else {
      await fetch(`${getApi()}/admin/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName, type: formType, data }),
      });
    }
    setShowForm(false);
    reload();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar este perfil?")) return;
    await fetch(`${getApi()}/admin/profiles/${id}`, { method: "DELETE" });
    reload();
  };

  if (loading) return <p className="text-sm text-gray-400">Cargando perfiles…</p>;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Botones crear */}
      <div className="flex gap-3">
        <button onClick={() => startCreate("user")}
          className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
          + Perfil de usuario
        </button>
        <button onClick={() => startCreate("interlocutor")}
          className="text-sm px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg">
          + Perfil de interlocutor
        </button>
      </div>

      {/* Formulario inline */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-gray-800">
            {editingId !== null ? "Editar" : "Nuevo"} perfil de {formType === "user" ? "usuario" : "interlocutor"}
          </h3>
          <div>
            <label className="text-xs text-gray-500">Nombre del perfil (clave)</label>
            <input value={formName} onChange={(e) => setFormName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-0.5" />
          </div>
          {Object.entries(formData).map(([k, v]) => (
            <div key={k}>
              <label className="text-xs text-gray-500">{k}</label>
              <input value={v} onChange={(e) => setFormData({ ...formData, [k]: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-0.5" />
            </div>
          ))}
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave}
              className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
              Guardar
            </button>
            <button onClick={() => setShowForm(false)}
              className="text-sm px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de perfiles */}
      {profiles.length === 0 ? (
        <p className="text-sm text-gray-400">No hay perfiles guardados aún.</p>
      ) : (
        <div className="space-y-3">
          {(["user", "interlocutor"] as const).map((type) => {
            const group = profiles.filter((p) => p.type === type);
            if (group.length === 0) return null;
            return (
              <div key={type}>
                <h3 className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-2">
                  {type === "user" ? "Usuarios" : "Interlocutores"}
                </h3>
                <div className="space-y-2">
                  {group.map((p) => (
                    <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800">{p.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {Object.entries(p.data).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">Actualizado {fmt(p.updated_at)}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => startEdit(p)}
                          className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg">
                          Editar
                        </button>
                        <button onClick={() => handleDelete(p.id)}
                          className="text-xs px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg">
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
