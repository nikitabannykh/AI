"use client";

import { useState } from "react";
import type { PromptCategory, Report } from "@/lib/types";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const CATEGORIES: PromptCategory[] = ["category", "best", "alternatives", "comparison", "use_case", "brand"];

export default function ReportView({ report, onReset }: { report: Report; onReset: () => void }) {
  const own = report.setup.brand.name;
  const brands = [report.setup.brand, ...report.setup.competitors].map((b) => b.name);
  const scores = [...report.scores].sort((a, b) => b.mentionRate - a.mentionRate || b.recommendRate - a.recommendRate);
  const ownScore = report.scores.find((s) => s.brand === own)!;
  const leader = scores[0];

  function exportJson() {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ai-visibility-${report.setup.brand.domain}-${report.generatedAt.slice(0, 10)}.json`;
    a.click();
  }

  return (
    <div className="space-y-8">
      {/* Headline */}
      <section className="grid gap-4 md:grid-cols-[auto_1fr]">
        <div className="card flex flex-col items-center justify-center px-10">
          <div className="label">Visibility score</div>
          <div className="text-6xl font-semibold tabular-nums" style={{ color: ownScore && report.visibilityScore >= 60 ? "var(--good)" : report.visibilityScore >= 30 ? "var(--accent)" : "var(--bad)" }}>
            {report.visibilityScore}
          </div>
          <div className="text-xs text-muted">/ 100 in Claude</div>
        </div>
        <div className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{own} · {report.setup.brand.domain}</h2>
            <div className="flex gap-2">
              <button className="btn-ghost text-xs" onClick={exportJson}>Export JSON</button>
              <button className="btn-ghost text-xs" onClick={onReset}>New audit</button>
            </div>
          </div>
          <p className="text-sm leading-relaxed">{report.summary}</p>
          <p className="mt-3 font-mono text-xs text-muted">
            {report.results.length} prompts · {report.totalUsage.searches} searches · {(report.totalUsage.inputTokens / 1000).toFixed(0)}k in / {(report.totalUsage.outputTokens / 1000).toFixed(0)}k out tokens · {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>
      </section>

      {/* Scoreboard */}
      <section className="card overflow-x-auto">
        <h2 className="mb-3 text-sm font-semibold">Share of voice vs competitors</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="py-2 pr-4">Brand</th>
              <th className="py-2 pr-4">Mentioned</th>
              <th className="py-2 pr-4">Recommended</th>
              <th className="py-2 pr-4">Avg position</th>
              <th className="py-2 pr-4">Own site cited</th>
              <th className="py-2 pr-4">Citation share</th>
              <th className="py-2">Sentiment</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((s) => (
              <tr key={s.brand} className={`border-t border-line ${s.brand === own ? "font-semibold" : ""}`}>
                <td className="py-2 pr-4">{s.brand}{s.brand === own && <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-ink">you</span>}</td>
                <td className="py-2 pr-4"><Bar value={s.mentionRate} /></td>
                <td className="py-2 pr-4"><Bar value={s.recommendRate} /></td>
                <td className="py-2 pr-4 tabular-nums">{s.avgPosition?.toFixed(1) ?? "—"}</td>
                <td className="py-2 pr-4 tabular-nums">{s.citedPrompts} / {report.results.length}</td>
                <td className="py-2 pr-4 tabular-nums">{pct(s.citationShare)}</td>
                <td className="py-2 font-mono text-xs"><span className="text-good">+{s.sentiment.positive}</span> · {s.sentiment.neutral} · <span className="text-bad">−{s.sentiment.negative}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {leader && leader.brand !== own && (
          <p className="mt-3 text-xs text-muted">
            {leader.brand} leads: mentioned in {pct(leader.mentionRate)} of prompts vs {pct(ownScore.mentionRate)} for {own}.
          </p>
        )}
      </section>

      {/* By category */}
      <section className="card">
        <h2 className="mb-3 text-sm font-semibold">Where {own} is missing — by prompt type</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {CATEGORIES.map((c) => {
            const v = ownScore.byCategory[c];
            if (!v.total) return null;
            const best = Math.max(...report.scores.map((s) => s.byCategory[c].mentioned));
            return (
              <div key={c} className="rounded-md border border-line p-3">
                <div className="label">{c.replace("_", " ")}</div>
                <div className="text-2xl tabular-nums">{v.mentioned}<span className="text-sm text-muted">/{v.total}</span></div>
                <div className="text-xs text-muted">best competitor: {best}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recommendations */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">What to fix, in order</h2>
        {report.recommendations.map((r, i) => (
          <div key={i} className="card">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${r.priority === "high" ? "bg-bad/10 text-bad" : r.priority === "medium" ? "bg-accent/15 text-accent-ink" : "bg-line text-muted"}`}>{r.priority}</span>
              <span className="rounded bg-line px-1.5 py-0.5 text-[10px] uppercase text-muted">{r.area.replace("_", " ")}</span>
              <h3 className="font-medium">{r.title}</h3>
            </div>
            <p className="text-sm"><span className="text-muted">Why: </span>{r.why}</p>
            <p className="mt-1 text-sm"><span className="text-muted">Do: </span>{r.action}</p>
            {r.evidence.length > 0 && (
              <p className="mt-2 font-mono text-[11px] text-muted">evidence: {r.evidence.join(" · ")}</p>
            )}
          </div>
        ))}
      </section>

      {/* Sources */}
      <section className="card overflow-x-auto">
        <h2 className="mb-1 text-sm font-semibold">Sources Claude actually cited</h2>
        <p className="mb-3 text-xs text-muted">These pages decide who gets named. Get onto the ones that carry your competitors.</p>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="py-2 pr-4">Domain</th>
              <th className="py-2 pr-4">Cites</th>
              <th className="py-2 pr-4">Prompts</th>
              <th className="py-2">Brands named alongside</th>
            </tr>
          </thead>
          <tbody>
            {report.sources.slice(0, 30).map((s) => (
              <tr key={s.domain} className="border-t border-line">
                <td className="py-2 pr-4 font-mono text-xs">
                  <a className="underline-offset-2 hover:underline" href={s.sampleUrls[0]} target="_blank" rel="noreferrer">{s.domain}</a>
                  {s.isOwn && <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent-ink">you</span>}
                  {s.isCompetitor && <span className="ml-2 rounded bg-line px-1.5 py-0.5 text-[10px] text-muted">{s.isCompetitor}</span>}
                </td>
                <td className="py-2 pr-4 tabular-nums">{s.citations}</td>
                <td className="py-2 pr-4 tabular-nums">{s.prompts}</td>
                <td className="py-2 text-xs">{s.brandsSupported.map((b) => (
                  <span key={b} className={`mr-1 ${b === own ? "font-semibold" : ""}`}>{b}</span>
                ))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Prompt matrix */}
      <section className="card overflow-x-auto">
        <h2 className="mb-3 text-sm font-semibold">Prompt by prompt</h2>
        <table className="w-full text-xs">
          <thead className="text-left uppercase tracking-wide text-muted">
            <tr>
              <th className="py-2 pr-3">Prompt</th>
              {brands.map((b) => (
                <th key={b} className="py-2 pr-2 text-center" title={b}>{b.split(" ")[0]}</th>
              ))}
              <th className="py-2">Cited</th>
            </tr>
          </thead>
          <tbody>
            {report.results.map((r) => (
              <PromptRow key={r.promptId} r={r} brands={brands} own={own} />
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-muted">● mentioned · ★ recommended · number = order of appearance. Click a row to read Claude&apos;s answer.</p>
      </section>
    </div>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded bg-line"><div className="h-full bg-foreground" style={{ width: pct(value) }} /></div>
      <span className="tabular-nums">{pct(value)}</span>
    </div>
  );
}

function PromptRow({ r, brands, own }: { r: Report["results"][number]; brands: string[]; own: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="cursor-pointer border-t border-line hover:bg-background" onClick={() => setOpen((o) => !o)}>
        <td className="py-2 pr-3">
          <span className="mr-2 rounded bg-line px-1 text-[10px] text-muted">{r.category}</span>
          {r.promptText}
          {r.error && <span className="ml-2 text-bad">error</span>}
        </td>
        {brands.map((b) => {
          const m = r.mentions.find((x) => x.brand === b);
          return (
            <td key={b} className={`py-2 pr-2 text-center tabular-nums ${b === own ? "font-semibold" : ""}`}>
              {m?.mentioned ? `${m.recommended ? "★" : "●"}${m.position ?? ""}` : <span className="text-line">—</span>}
            </td>
          );
        })}
        <td className="py-2 font-mono text-[11px] text-muted">{r.citations.slice(0, 3).map((c) => c.domain).join(", ")}{r.citations.length > 3 ? ` +${r.citations.length - 3}` : ""}</td>
      </tr>
      {open && (
        <tr className="border-t border-line bg-background">
          <td colSpan={brands.length + 2} className="p-4">
            {r.searchQueries.length > 0 && (
              <p className="mb-2 font-mono text-[11px] text-muted">searched: {r.searchQueries.join(" | ")}</p>
            )}
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">{r.answer || r.error}</pre>
            {r.otherBrands.length > 0 && (
              <p className="mt-2 text-[11px] text-muted">other brands named: {r.otherBrands.join(", ")}</p>
            )}
            {r.citations.length > 0 && (
              <ul className="mt-2 space-y-0.5 font-mono text-[11px]">
                {r.citations.map((c) => (
                  <li key={c.url}><a className="text-muted hover:underline" href={c.url} target="_blank" rel="noreferrer">{c.url}</a></li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
