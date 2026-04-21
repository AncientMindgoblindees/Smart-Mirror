import { useEffect, useRef } from 'react';

import { getWebSocketUrl } from '@/config/backendOrigin';

export const MIRROR_TACTILE_ACTIONS = ['open', 'up', 'down', 'select', 'back'] as const;

export type MirrorTactileAction = (typeof MIRROR_TACTILE_ACTIONS)[number];

export type MirrorButtonInput = {
  source: 'keyboard' | 'gpio';
  semanticAction?: string;
  semanticActions?: string[];
  effect?: string;
};

export type MirrorInputActions = {
  onButtonInput: (input: MirrorButtonInput) => void;
  getSleepMode: () => boolean;
};

const SEMANTIC_ACTION_ALIASES: Record<string, readonly string[]> = {
  open: ['open', 'menu_open', 'profile_menu_open'],
  menu_open: ['open', 'menu_open', 'profile_menu_open'],
  profile_menu_open: ['open', 'profile_menu_open', 'menu_open'],
  up: ['up', 'menu_up'],
  menu_up: ['up', 'menu_up'],
  down: ['down', 'menu_down'],
  menu_down: ['down', 'menu_down'],
  select: ['select', 'menu_select'],
  menu_select: ['select', 'menu_select'],
  back: ['back', 'menu_back', 'menu_close'],
  menu_back: ['back', 'menu_back', 'menu_close'],
  menu_close: ['back', 'menu_close', 'menu_back'],
  display_toggle_dim: ['display_toggle_dim', 'toggle_dim'],
  toggle_dim: ['display_toggle_dim', 'toggle_dim'],
  display_toggle_sleep: ['display_toggle_sleep', 'toggle_sleep'],
  toggle_sleep: ['display_toggle_sleep', 'toggle_sleep'],
};

function normalizeSemanticActions(actions: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const action of actions) {
    if (!action || action === 'none') continue;

    const aliases = SEMANTIC_ACTION_ALIASES[action] ?? [action];
    for (const alias of aliases) {
      if (seen.has(alias)) continue;
      seen.add(alias);
      normalized.push(alias);
    }
  }

  return normalized;
}

function createMirrorButtonInput(
  source: MirrorButtonInput['source'],
  payload: Pick<MirrorButtonInput, 'semanticAction' | 'semanticActions' | 'effect'>,
): MirrorButtonInput {
  return {
    source,
    semanticAction: payload.semanticAction,
    semanticActions: normalizeSemanticActions([
      ...(payload.semanticActions ?? []),
      payload.semanticAction,
    ]),
    effect: payload.effect,
  };
}

function emitKeyboardAction(ref: { current: MirrorInputActions }, action: string): void {
  ref.current.onButtonInput(createMirrorButtonInput('keyboard', { semanticAction: action }));
}

export function useMirrorInput(actions: MirrorInputActions) {
  const ref = useRef(actions);
  ref.current = actions;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null;
      if (element?.closest('input, textarea, select, [contenteditable="true"]')) return;

      if (ref.current.getSleepMode()) {
        event.preventDefault();
        emitKeyboardAction(ref, 'display_toggle_sleep');
        return;
      }

      const key = event.key;
      if (key === 'ArrowUp') {
        event.preventDefault();
        emitKeyboardAction(ref, 'menu_up');
        return;
      }
      if (key === 'ArrowDown') {
        event.preventDefault();
        emitKeyboardAction(ref, 'menu_down');
        return;
      }
      if (key === 'Enter') {
        event.preventDefault();
        emitKeyboardAction(ref, 'menu_select');
        return;
      }
      if (key === 'Escape' || key === 'Backspace') {
        event.preventDefault();
        emitKeyboardAction(ref, 'menu_back');
        return;
      }
      if (key === 'm' || key === 'M') {
        event.preventDefault();
        emitKeyboardAction(ref, 'profile_menu_open');
        return;
      }
      if (key === 'd' || key === 'D') {
        event.preventDefault();
        emitKeyboardAction(ref, 'toggle_dev_panel');
        return;
      }
      if (key === '2') {
        event.preventDefault();
        emitKeyboardAction(ref, 'display_toggle_dim');
        return;
      }
      if (key === '3') {
        event.preventDefault();
        emitKeyboardAction(ref, 'display_toggle_sleep');
        return;
      }
      if (key === 'x' || key === 'X') {
        event.preventDefault();
        emitKeyboardAction(ref, 'dismiss_tryon');
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const wsUrl = getWebSocketUrl('/ws/buttons');
    let ws: WebSocket | null = null;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    const BACKOFF_INITIAL = 1000;
    const BACKOFF_MAX = 30_000;
    let backoff = BACKOFF_INITIAL;

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        reconnectTimer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, BACKOFF_MAX);
        return;
      }

      ws.onopen = () => {
        backoff = BACKOFF_INITIAL;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as {
            effect?: string;
            semantic_action?: string;
            semantic_actions?: string[];
          };
          ref.current.onButtonInput(
            createMirrorButtonInput('gpio', {
              semanticAction: data.semantic_action,
              semanticActions: Array.isArray(data.semantic_actions) ? data.semantic_actions : [],
              effect: data.effect,
            }),
          );
        } catch {
          /* ignore invalid button frames */
        }
      };

      ws.onclose = () => {
        if (!closed) {
          reconnectTimer = setTimeout(connect, backoff);
          backoff = Math.min(backoff * 2, BACKOFF_MAX);
        }
      };

      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, []);
}
