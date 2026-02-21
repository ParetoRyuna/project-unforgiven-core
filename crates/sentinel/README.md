# Sentinel Service v2

Run (from repo root):

```bash
cargo run -p sentinel-service-v2 -- configs/sentinel_config_v2.toml
```

Notes:
- `rig.enabled=false` (default in config) does not require `OPENAI_API_KEY`.
- For localnet, start the validator with WS enabled (default `ws://127.0.0.1:8900`).

