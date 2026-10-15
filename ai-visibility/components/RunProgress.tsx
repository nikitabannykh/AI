"use client";

import type { PromptResult, Setup } from "@/lib/types";

export default function RunProgress({ setup, results, finishing }: { setup: Setup; results: PromptResult[]; finishing: boolean }) {
  const total = setup.prompts.length;
  const done = results.length;
  const own = setup.brand.name;
  const byId = new Map(results.map((r) => [r.promptId, r]));

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span>{finishing ? "Scoring and writing recommendations…" : `Asking Claude · ${done}/${total}`}</span>
        <span className="font-mono text-xs text-muted">
          {results.reduce((n, r) => n + r.usage.searches, 0)} searches
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded bg-line">
        <div className="h-full bg-accent transition-all" style={{ width: `${(done / total) * 100}%` }} />
      </div>
      <ul className="divide-y divide-line text-sm">
        {setup.prompts.map((p) => {
          const r = byId.get(p.id);
          const m = r?.mentions.find((x) => x.brand === own);
          return (
            <li key={p.id} className="flex items-center justify-between gap-4 py-2">
              <span className={r ? "" : "text-muted"}>{p.text}</span>
              <span className="shrink-0 font-mono text-xs">
                {!r ? "…" : r.error ? <span className="text-bad">error</span> : m?.mentioned ? <span className="text-good">mentioned{m.recommended ? " ★" : ""}</span> : <span className="text-muted">absent</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
