# Teacher mini-program

Standalone WeChat mini-program built with Taro 4.3.0, React 18, and TypeScript. It uses the existing `/api/v1` server contracts and does not import the web application at runtime; shared domain imports are type-only.

## Development

Run `pnpm --filter @repo/teacher-miniprogram dev` and open `apps/teacher-miniprogram` in WeChat DevTools. The checked-in `project.config.json` points `miniprogramRoot` to the generated `dist/` directory and uses the `touristappid` placeholder; set a real AppID in your local DevTools project settings. Keep URL checking enabled; local-only DevTools overrides belong in the ignored `project.private.config.json`. Development defaults the API and socket origins to localhost. Production builds require an HTTPS `TARO_APP_API_ORIGIN` ending in `/api/v1`; set `TARO_APP_SOCKET_ORIGIN` only to override the derived WSS origin.

Use `pnpm --filter @repo/teacher-miniprogram typecheck`, `lint`, `test`, and `build` for package checks. The test script exercises the transport, auth/session races, class isolation, realtime lifecycle/protocol, and feature helpers.

## Runtime boundaries

- Session and active-class state use namespaced Taro storage through `src/lib/api.ts`; pages should use its session and active-class helpers instead of writing storage keys directly.
- HTTP writes are never retried automatically. Only an explicit 401 may trigger one shared refresh and one request replay. Logout clears the current session immediately; pending writes retain only their teacher/class and idempotency key for result lookup, with student IDs and message content removed.
- Realtime uses the Socket.IO Engine.IO v4 WebSocket protocol on `/socket.io/` and authenticates the `/realtime` namespace with the current access token and class ID. Classroom students and seating refresh on foreground and realtime invalidation; there is no classroom polling fallback.
- Announcements refresh their status from REST every 3 seconds while the announcements page is visible. Hiding or unmounting that page stops the timer. Classroom data relies on foreground refresh and realtime events when connected.
- Invitation linking uses the server-issued short-lived ticket and invitation token. The client does not merge or switch an existing account binding.
