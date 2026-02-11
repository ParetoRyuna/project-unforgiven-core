# Project UNFORGIVEN — Frontend Design System (v0 Style)

## Design Philosophy

**"Burnt & Chrome"** — Industrial, High-End, Cyber-Physical.

## Tech Stack

- **Next.js 14** + **Tailwind CSS** + **shadcn/ui** (`@/components/ui`) + **Framer Motion**

---

## 1. Component Rules (shadcn/ui)

When generating UI, use the installed shadcn-style components from `@/components/ui`:

| Use case   | Components |
|-----------|------------|
| Cards     | `Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter` |
| Buttons   | `Button` (variants: `default`, `outline`, `ghost`, `destructive`) |
| Labels    | `Badge` (variants: `default`, `secondary`, `destructive`, `outline`) |
| Layout    | Tailwind `flex`, `grid`, `gap` |
| Icons     | `lucide-react` |

---

## 2. Theming (Burnt & Chrome)

| Token        | Usage |
|-------------|--------|
| **Background** | `bg-zinc-950` (Deep Black / Metal) |
| **Primary**    | `text-orange-600` / `bg-orange-600` (Burnt Orange) |
| **Accents**    | `border-zinc-800` (Chrome borders) |
| **Glassmorphism** | `bg-black/40 backdrop-blur-md border border-white/10` for floating panels, or utility `.glass-float` / `.glass-panel` |

CSS variables in `app/globals.css`:

- `--bg-deep`, `--primary-burnt`, `--accent-border`, `--glass-bg`, `--glass-border`

---

## 3. Animation (Framer Motion)

- **Entrance**: `initial={{ opacity: 0, y: 10 }}` → `animate={{ opacity: 1, y: 0 }}`. Use `MotionDiv` with `entrance` or `TicketCard` for consistent entrance.
- **Numbers**: Use `CountUp` in `@/components/ui/count-up` for price/score slot-machine style count.
- **Feedback**: Buttons use `whileTap={{ scale: 0.98 }}`; import `tapScale` from `@/components/ui/motion` when wrapping custom buttons.

---

## 4. Example: Ticket Card

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TicketCard } from "@/components/ui/ticket-card";
import { motion } from "framer-motion";

// Pre-built ticket card (entrance + tier badge + price)
<TicketCard tier={1} price={0.5} title="GENERAL ACCESS" />

// Or build manually:
<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
  <Card className="bg-zinc-900/50 border-orange-500/20 backdrop-blur">
    <CardHeader className="flex flex-row items-center justify-between">
      <CardTitle className="text-xl font-bold tracking-tighter text-white">
        GENERAL ACCESS
      </CardTitle>
      <Badge variant={tier === 1 ? "default" : "destructive"}>
        {tier === 1 ? "VERIFIED FAN" : "HIGH RISK"}
      </Badge>
    </CardHeader>
    <CardContent>
      <div className="text-4xl font-black text-white font-mono">
        {price} <span className="text-sm text-zinc-500">SOL</span>
      </div>
    </CardContent>
  </Card>
</motion.div>
```

---

## File Map

- `lib/utils.ts` — `cn()` for class merging
- `components/ui/button.tsx` — Button (Burnt primary, outline, ghost, destructive)
- `components/ui/card.tsx` — Card + CardHeader/Title/Description/Content/Footer
- `components/ui/badge.tsx` — Badge
- `components/ui/ticket-card.tsx` — TicketCard (entrance + tier + price)
- `components/ui/motion.tsx` — MotionDiv, tapScale
- `components/ui/count-up.tsx` — CountUp for numbers
- `app/globals.css` — CSS variables + .glass-panel / .glass-float
- `tailwind.config.ts` — unforgiven tokens, glow-burnt shadows
