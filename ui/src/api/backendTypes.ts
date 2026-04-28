/** Mirrors FastAPI `WidgetConfigOut` / `WidgetConfigUpdate` JSON shape. */

export interface WidgetConfigOut {
  id: number;
  widget_id: string;
  enabled: boolean;
  position_row: number;
  position_col: number;
  size_rows: number;
  size_cols: number;
  config_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface WidgetConfigUpdate {
  id?: number | null;
  widget_id: string;
  enabled: boolean;
  position_row: number;
  position_col: number;
  size_rows: number;
  size_cols: number;
  config_json?: Record<string, unknown> | null;
}

export interface UserSettingsOut {
  id: number;
  theme: string;
  primary_font_size: number;
  accent_color: string;
  created_at: string;
  updated_at: string;
}

export interface UserSettingsUpdate {
  theme?: string;
  primary_font_size?: number;
  accent_color?: string;
}

export interface CameraStatusOut {
  active: boolean;
  booting?: boolean;
  countdown_remaining: number;
  last_capture_id?: string | null;
  last_capture_at?: string | null;
}

export interface CameraCaptureRequest {
  countdown_seconds?: number;
  source?: string;
  session_id?: string;
}

/** GET /api/weather/ — WeatherAPI.com snapshot (proxied by backend). */
export interface WeatherForecastDayOut {
  weekday: string;
  high: number;
  low: number;
  condition: string;
}

export interface WeatherSnapshotOut {
  configured: boolean;
  live: boolean;
  location: string;
  temperature_unit: 'celsius' | 'fahrenheit';
  temp?: number | null;
  feels_like?: number | null;
  humidity_pct?: number | null;
  wind_speed?: number | null;
  wind_unit: 'kmh' | 'mph';
  condition_text: string;
  condition: string;
  forecast: WeatherForecastDayOut[];
  error?: string | null;
}

/** GET/POST /api/clothing/ — matches `ClothingItemRead`. */
export interface ClothingItemRead {
  id: number;
  name: string;
  category: string;
  color?: string | null;
  season?: string | null;
  notes?: string | null;
  favorite: boolean;
  created_at: string;
  updated_at: string;
  images?: ClothingImageRead[] | null;
}

/** GET /api/clothing/{id}/images — matches `ClothingImageRead`. */
export interface ClothingImageRead {
  id: number;
  clothing_item_id: number;
  storage_provider: string;
  storage_key: string;
  image_url: string;
  created_at: string;
}

export interface ClothingItemUpdate {
  name?: string;
  category?: string;
  color?: string | null;
  season?: string | null;
  notes?: string | null;
  favorite?: boolean;
}

export interface OutfitGenerateRequest {
  clothing_image_ids: number[];
  prompt?: string;
}

export interface OutfitGenerateResponse {
  status: string;
  generation_id: string;
  image_url: string;
}

export interface PersonImageRead {
  id: number;
  file_path: string;
  status: string;
  created_at: string;
}

// ── Auth types ──────────────────────────────────────────────────────

export interface AuthProviderStatus {
  provider: string;
  connected: boolean;
  status: string;
  scopes?: string | null;
  connected_at?: string | null;
}

export interface DeviceCodeResponse {
  provider: string;
  verification_uri: string;
  user_code: string;
  expires_in: number;
  interval: number;
  message?: string | null;
}

export interface AuthLoginStatus {
  provider: string;
  status: string;
  message?: string | null;
}

// ── Calendar types ──────────────────────────────────────────────────

export interface CalendarEventItem {
  id: number;
  type: string;
  title: string;
  start_time?: string | null;
  end_time?: string | null;
  all_day: boolean;
  source: string;
  priority: string;
  completed: boolean;
  metadata: Record<string, unknown>;
}

export interface CalendarEventsResponse {
  events: CalendarEventItem[];
  providers: string[];
  last_sync?: string | null;
}

export interface CalendarTasksResponse {
  tasks: CalendarEventItem[];
  providers: string[];
  last_sync?: string | null;
}

export interface EmailMessageItem {
  source: string;
  sender: string;
  subject: string;
  received_at?: string | null;
  unread: boolean;
  high_priority: boolean;
}

export interface EmailMessagesResponse {
  messages: EmailMessageItem[];
  providers: string[];
}
