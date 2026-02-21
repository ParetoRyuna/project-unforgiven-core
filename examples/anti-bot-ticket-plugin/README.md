# Anti-Bot Ticket Plugin (Example)

This is a minimal "Shield-first" plugin example.

Files:
- `index.js`: core integration logic (single Shield call + allow/block/step_up decision)
- `plugin.manifest.template.json`: plugin metadata template

Run:
```bash
cd "/Users/lenovo/Desktop/HACKTHON PROJECT"
SHIELD_API_BASE=http://127.0.0.1:3100 node ./examples/anti-bot-ticket-plugin/index.js 11111111111111111111111111111111
```

Expected output:
- `decision=allow` for normal cases
- `decision=block` when shield marks low dignity
- `decision=step_up` when returned price is above your local safety threshold

Notes:
- This plugin is intentionally tiny; production plugins should add retries, better wallet validation, and persistent audit logs.
