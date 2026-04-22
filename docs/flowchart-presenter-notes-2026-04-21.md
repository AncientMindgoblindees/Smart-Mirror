# Smart Mirror Flowchart Presenter Notes

## Asset
- `docs/assets/smart-mirror-abstract-flowchart.jpg`

## 30-second talk track
"This diagram shows the Smart Mirror as four simple layers. The mirror device captures user input and renders the UI, the FastAPI backend orchestrates APIs, events, and local storage, the companion app controls layout and interactions, and Cloudflare D1 sync keeps selected data aligned remotely. The center of gravity is the backend, which bridges real-time control traffic and persistent sync."

## How to present it
- Start left-to-right: Device -> Backend -> Companion -> Cloud.
- Emphasize that this is an abstract view of the current implementation, not a future-state proposal.
- Call out that local-first behavior still works even if cloud sync is temporarily unavailable.
