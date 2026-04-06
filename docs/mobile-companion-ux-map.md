# Mobile Companion UX Map

## Information Architecture

- `Layout`: drag, resize, remove, and add widgets on a mirror preview canvas.
- `Camera`: trigger countdown/capture workflow and show live capture state.
- `Wardrobe`: upload clothing, browse saved items, and select an item for try-on.
- `Connection`: verify API/WS status and pairing configuration.

## Core interaction model

1. User opens companion app and confirms mirror connection.
2. User edits layout with direct manipulation (touch drag/resize), saves through REST sync.
3. User uploads wardrobe items, then taps an item to send selection state.
4. User taps **Capture Pose**:
   - companion calls `POST /api/camera/capture`,
   - mirror UI opens camera overlay,
   - countdown ticks are shown on both surfaces,
   - capture completion event confirms success.

## Mobile design guardrails

- Touch targets stay at or above 44x44 px.
- Important controls are reachable in portrait mode without horizontal scrolling.
- Every networked action surfaces `pending/success/error` feedback.
- Connection settings are persisted locally and editable from one modal.
