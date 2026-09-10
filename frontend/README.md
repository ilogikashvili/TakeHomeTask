# Ledger frontend

React application for the subscription ledger, assistant and renewal reminders.

## Local demo

1. Configure and start the backend on port 3000. To use demo sign-in, set `ENABLE_DEMO_LOGIN=true` and `NODE_ENV=development` in `backend/.env`. The demo endpoints are disabled by default and always unavailable outside development.
2. In this directory run `npm ci` and `npm run dev`.
3. Open the URL printed by Vite. Select a demo owner and role, or supply an existing access token.

Vite proxies `/api` and `/socket.io` to the backend. Tokens are held in session storage. Demo tokens last 15 minutes; there is no refresh-token flow.

The UI includes filtering, all supported sorts, page navigation, grouped totals, CSV download, create/edit/delete, bulk changes, approval history, streamed assistant answers, clarification selection, ledger links and unread reminder recovery. Reminder sockets refresh the list on reconnect and on events; polling provides a fallback.

## Verification

`npm run build` compiles TypeScript and builds the app. Run `npm run test:e2e` and `npm run build` in the backend first, then `npm test` here. Browser tests use the isolated `_e2e` database and development-only demo login. They start and stop their own local servers. Windows uses installed Edge; Linux CI installs Playwright Chromium.

Current smoke coverage: owner login, ledger display, fixture creation/deletion, filtering, assistant result link, reminders screen, and mobile rendering. Admin bulk UI, visible conflict recovery, clarification selection, live reminder arrival/dismissal, keyboard/accessibility and other browsers still require broader coverage.

## Deployment

Serve `dist` from a static web server with SPA fallback to `index.html`. Proxy `/api` to the backend with the prefix stripped and `/socket.io` with WebSocket support. The Vite proxy is development-only. Production HTTPS, security headers, origins and deployment verification are not configured by this frontend build.
