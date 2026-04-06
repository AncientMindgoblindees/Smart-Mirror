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
  countdown_remaining: number;
  last_capture_id?: string | null;
  last_capture_at?: string | null;
}

export interface CameraCaptureRequest {
  countdown_seconds?: number;
  source?: string;
  session_id?: string;
}

export interface WardrobeItemOut {
  id: number;
  user_id: string;
  name: string;
  category?: string | null;
  image_url: string;
  created_at: string;
  updated_at: string;
}
