# dignity-scoring service (v2)

This folder encapsulates all Dignity adapter logic for:
- GitHub (`commit_count > 50 => +40`)
- Spotify (`playtime_hours > 10 => +30`)
- Twitter/X (`account_age_days > 365 && activity_score >= 50 => +20`)

Primary API:
- `computeDignityScore(attestations)` in `src/index.ts`

Input:
- raw attestations only

Output:
- normalized `AdapterBreakdown` with `totalScore` and `adapterMask`

`shield-oracle` consumes this service and applies user mode policy (`bot/guest/verified`) separately.
