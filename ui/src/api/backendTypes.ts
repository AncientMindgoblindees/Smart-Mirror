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

export interface ClothingItemRead {
  id: number;
  name: string;
  category: string;
  color?: string | null;
  season?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  images?: ClothingImageRead[] | null;
}

export interface ClothingImageRead {
  id: number;
  clothing_item_id: number;
  storage_provider: string;
  storage_key: string;
  image_url: string;
  created_at: string;
}

export interface MirrorRegistrationRequest {
  hardware_id: string;
  friendly_name?: string | null;
  hardware_token?: string | null;
}

export interface MirrorRegistrationResponse {
  id: string;
  hardware_id: string;
  friendly_name?: string | null;
  created_at: string;
  updated_at: string;
  hardware_token: string;
}

export interface MirrorProfile {
  id: number;
  mirror_id: string;
  user_id: string;
  display_name?: string | null;
  widget_config?: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MirrorSyncResponse {
  mirror: {
    id: string;
    hardware_id: string;
    friendly_name?: string | null;
    created_at: string;
    updated_at: string;
  };
  active_profile?: MirrorProfile | null;
  widget_config: WidgetConfigOut[];
  user_settings?: UserSettingsOut | null;
}

export interface ProfileEnrollRequest {
  hardware_id: string;
  user_id: string;
  display_name?: string | null;
  widget_config?: Record<string, unknown> | null;
  activate?: boolean;
}

export interface ProfileActivateRequest {
  hardware_id: string;
  target_user_id: string;
}

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
  target_user_id?: string | null;
  intent?: string | null;
}

export interface AuthLoginStatus {
  provider: string;
  status: string;
  message?: string | null;
  intent?: string | null;
}

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
