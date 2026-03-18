export type AgentType = "interlocutor" | "user" | "system";
export type ConversationMode = "auto" | "real";
export type ChosenBy = "auto" | "human";

export interface ChatMessage {
  id: string;
  role: AgentType;
  content: string;
  name: string;
  turn: number;
  selectedIndex?: number;
  chosenBy?: ChosenBy;
}

export interface Suggestion {
  index: number;
  text: string;
}

export type WsEventType =
  | "status"
  | "thinking"
  | "interlocutor"
  | "suggestions"
  | "user"
  | "error"
  | "done";

export interface WsEvent {
  type: WsEventType;
  content?: string | string[];
  name?: string;
  turn?: number;
  selected_index?: number;
  chosen_by?: ChosenBy;
  agent?: string;
  session_id?: string;
  mode?: ConversationMode;
  wait_seconds?: number;
  user_profile?: UserProfile;
  interlocutor_profile?: InterlocutorProfile;
}

export interface UserProfile {
  name: string;
  age: number;
  condition: string;
  communication_style: string;
  interests: string;
  sensitivities: string;
}

export interface InterlocutorProfile {
  name: string;
  relationship: string;
  communication_style: string;
  context: string;
}

export interface ConversationConfig {
  user_profile: UserProfile;
  interlocutor_profile: InterlocutorProfile;
  topic: string;
  max_turns: number;
  mode: ConversationMode;
  wait_seconds: number;
  pictograms: {
    interlocutor: boolean;
    user: boolean;
    suggestions: boolean;
  };
}

// ── Admin ──────────────────────────────────────────────────────────────────

export interface PictogramItem {
  word: string;
  pictogram_id: number;
  url: string;
}

export interface StoredProfile {
  id: number;
  name: string;
  type: "user" | "interlocutor";
  data: UserProfile | InterlocutorProfile;
  created_at: string;
  updated_at: string;
}

export interface SessionSummary {
  id: string;
  topic: string;
  mode: ConversationMode;
  wait_seconds: number;
  max_turns: number;
  turn_count: number;
  started_at: string;
  ended_at: string | null;
  user_name: string;
  interlocutor_name: string;
}

export interface TurnRecord {
  id: number;
  session_id: string;
  turn_number: number;
  interlocutor_msg: string;
  suggestion_0: string;
  suggestion_1: string;
  suggestion_2: string;
  chosen_text: string;
  chosen_index: number;
  chosen_by: ChosenBy;
  created_at: string;
  interlocutor_pictograms: string | null;
  suggestion_0_pictograms: string | null;
  suggestion_1_pictograms: string | null;
  suggestion_2_pictograms: string | null;
  chosen_text_pictograms: string | null;
}

export interface SessionDetail {
  session: SessionSummary & { user_profile: UserProfile; interlocutor_profile: InterlocutorProfile };
  turns: TurnRecord[];
}
