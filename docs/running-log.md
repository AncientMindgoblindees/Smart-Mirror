# Running Log

## 2026-04-17 - Vite security hardening

- Reviewed Vite-related config and package versions in both `Smart-Mirror` and `Smart-Mirror-App`.
- Identified network-exposed dev server defaults and outdated Vite version in `Smart-Mirror-App`.
- Updated Vite versions:
  - `Smart-Mirror-App/package.json`: `vite` -> `^6.4.2` (dependencies + devDependencies)
  - `Smart-Mirror/ui/package.json`: `vite` -> `^8.0.8`
- Hardened local dev default in `Smart-Mirror-App/package.json`:
  - `dev` script changed from `vite --port=3000 --host=0.0.0.0` to `vite --port=3000`
- Refreshed lockfiles with `npm install` in:
  - `Smart-Mirror-App`
  - `Smart-Mirror/ui`
- Verified both projects still build:
  - `npm run build` passed in `Smart-Mirror-App` (Vite `6.4.2`)
  - `npm run build` passed in `Smart-Mirror/ui` (Vite `8.0.8`)
