---
description: Launch the AgenticOS dashboard (local web UI on 127.0.0.1)
---

Launch the AgenticOS dashboard:

1. Determine the port: the `AGENTICOS_PORT` environment variable if set,
   otherwise 4517.
2. Check whether it is already running: request
   `http://127.0.0.1:<port>/api/status`. If it responds, report the URL
   and stop — do not start a second server.
3. Otherwise locate the AgenticOS plugin root (the directory containing
   `ui/server.js`) and start the server as a background process:
   `node <pluginRoot>/ui/server.js`.
4. Confirm it came up (the status endpoint responds), then report:
   - the URL `http://127.0.0.1:<port>`
   - that it binds to localhost only and is not reachable from the network
   - that custom buttons live in `~/.claude/agenticos/dashboard.json`
   - how to stop it (kill the background node process).
