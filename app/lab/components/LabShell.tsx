import Link from 'next/link';

export function LabShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1a1a1a_0%,#060606_45%,#030303_100%)] text-zinc-100">
      <div className="px-5 py-6 border-b border-zinc-800/80 bg-black/30 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-400/90">WanWan Lab</p>
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {subtitle ? <p className="text-sm text-zinc-400 mt-1">{subtitle}</p> : null}
          </div>
          <Link
            href="/lab"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-500"
          >
            Back
          </Link>
        </div>
      </div>
      <div className="px-4 py-5 space-y-4">{children}</div>
    </div>
  );
}
