"use client";

import { useState } from "react";
import type { Brand, Prompt, PromptCategory, Setup } from "@/lib/types";
import type { SiteProfile } from "@/lib/prompts";

const CATEGORIES: PromptCategory[] = ["category", "best", "alternatives", "comparison", "use_case", "brand"];
const MARKETS = ["", "US", "GB", "DE", "CZ", "FR", "ES", "NL", "AE"];

type Props = {
  setup: Setup;
  profile: SiteProfile | null;
  busy: boolean;
  onBack: () => void;
  onRun: (setup: Setup) => void;
};

export default function PromptsEditor({ setup, profile, busy, onBack, onRun }: Props) {
  const [brand, setBrand] = useState<Brand>(setup.brand);
  const [competitors, setCompetitors] = useState<Brand[]>(setup.competitors);
  const [prompts, setPrompts] = useState<Prompt[]>(setup.prompts);
  const [market, setMarket] = useState(setup.market ?? "");

  function updatePrompt(i: number, patch: Partial<Prompt>) {
    setPrompts((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }
  function addPrompt() {
    setPrompts((ps) => [...ps, { id: `p${Date.now()}`, text: "", category: "best" }]);
  }
  function updateCompetitor(i: number, patch: Partial<Brand>) {
    setCompetitors((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }

  const valid = brand.name && brand.domain && prompts.filter((p) => p.text.trim()).length >= 3;

  return (
    <div className="space-y-6">
      {profile && (
        <div className="card text-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <Fact label="Industry" value={profile.industry} />
            <Fact label="Category (as buyers say it)" value={profile.productCategory} />
            <Fact label="Buyers" value={profile.targetBuyers.join(", ")} />
          </div>
          {profile.categoryAliases.length > 0 && (
            <p className="mt-3 text-xs text-muted">Aliases: {profile.categoryAliases.join(" · ")}</p>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="card space-y-4">
          <h2 className="text-sm font-semibold">Brands</h2>
          <div className="grid grid-cols-[1fr_1fr] gap-2">
            <input className="input" value={brand.name} onChange={(e) => setBrand({ ...brand, name: e.target.value })} placeholder="Brand name" />
            <input className="input font-mono text-xs" value={brand.domain} onChange={(e) => setBrand({ ...brand, domain: e.target.value })} placeholder="domain" />
          </div>
          <input
            className="input text-xs"
            value={brand.aliases?.join(", ") ?? ""}
            onChange={(e) => setBrand({ ...brand, aliases: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            placeholder="Aliases, comma-separated (e.g. Octopus, Octopus NRCS)"
          />

          <h3 className="pt-2 text-xs font-medium uppercase tracking-wide text-muted">Competitors</h3>
          <div className="space-y-2">
            {competitors.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <input className="input" value={c.name} onChange={(e) => updateCompetitor(i, { name: e.target.value })} />
                <input className="input font-mono text-xs" value={c.domain} onChange={(e) => updateCompetitor(i, { domain: e.target.value })} />
                <button type="button" className="btn-ghost px-2" onClick={() => setCompetitors((cs) => cs.filter((_, j) => j !== i))} aria-label="remove">×</button>
              </div>
            ))}
            <button type="button" className="btn-ghost text-xs" onClick={() => setCompetitors((cs) => [...cs, { name: "", domain: "" }])}>+ add competitor</button>
          </div>

          <h3 className="pt-2 text-xs font-medium uppercase tracking-wide text-muted">Search market (optional)</h3>
          <select className="input" value={market} onChange={(e) => setMarket(e.target.value)}>
            {MARKETS.map((m) => (
              <option key={m} value={m}>{m || "Global / default"}</option>
            ))}
          </select>
        </section>

        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Prompts ({prompts.length})</h2>
            <button type="button" className="btn-ghost text-xs" onClick={addPrompt}>+ add prompt</button>
          </div>
          <div className="space-y-2">
            {prompts.map((p, i) => (
              <div key={p.id} className="grid grid-cols-[1fr_130px_auto] gap-2">
                <input className="input" value={p.text} onChange={(e) => updatePrompt(i, { text: e.target.value })} />
                <select className="input text-xs" value={p.category} onChange={(e) => updatePrompt(i, { category: e.target.value as PromptCategory })}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button type="button" className="btn-ghost px-2" onClick={() => setPrompts((ps) => ps.filter((_, j) => j !== i))} aria-label="remove">×</button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="flex items-center justify-between">
        <button type="button" className="btn-ghost" onClick={onBack}>← Back</button>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted">
            ~{prompts.length} answers · up to {prompts.length * 5} searches
          </span>
          <button
            className="btn-primary"
            disabled={busy || !valid}
            onClick={() =>
              onRun({
                ...setup,
                brand,
                competitors: competitors.filter((c) => c.name && c.domain),
                prompts: prompts.filter((p) => p.text.trim()),
                market: market || undefined,
              })
            }
          >
            Run audit →
          </button>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div>{value}</div>
    </div>
  );
}
