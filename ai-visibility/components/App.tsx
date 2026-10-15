"use client";

import { useEffect, useState } from "react";
import type { Brand, Prompt, PromptResult, Report, Setup } from "@/lib/types";
import type { SiteProfile } from "@/lib/prompts";
import SetupForm from "./SetupForm";
import PromptsEditor from "./PromptsEditor";
import RunProgress from "./RunProgress";
import ReportView from "./ReportView";

type Stage = "setup" | "prompts" | "running" | "report";

const STORAGE_KEY = "ai-visibility:last-report";
const CONCURRENCY = 3;

export default function App() {
  const [stage, setStage] = useState<Stage>("setup");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [url, setUrl] = useState("");
  const [profile, setProfile] = useState<SiteProfile | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);

  const [results, setResults] = useState<PromptResult[]>([]);
  const [report, setReport] = useState<Report | null>(null);

  // Restore the last report so a refresh doesn't throw away a paid run.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const r = JSON.parse(raw) as Report;
        setReport(r);
        setSetup(r.setup);
        setResults(r.results);
        setStage("report");
      }
    } catch {
      /* ignore */
    }
  }, []);

  async function handleProfile(input: { url: string; language: string; competitors: Brand[]; promptCount: number }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Profile failed");
      const p = data as SiteProfile;
      setUrl(input.url);
      setProfile(p);
      const competitors = input.competitors.length ? mergeCompetitors(input.competitors, p.suggestedCompetitors) : p.suggestedCompetitors;
      setSetup({
        brand: { name: p.brandName, domain: bare(input.url) },
        competitors,
        prompts: p.prompts,
        language: input.language,
        industry: p.industry,
      });
      setStage("prompts");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRun(finalSetup: Setup) {
    setSetup(finalSetup);
    setResults([]);
    setReport(null);
    setError(null);
    setStage("running");

    const out: PromptResult[] = [];
    const queue = [...finalSetup.prompts];

    async function worker() {
      while (queue.length) {
        const prompt = queue.shift()!;
        const r = await runOne(prompt, finalSetup);
        out.push(r);
        setResults([...out]);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

    // Keep original prompt order.
    const ordered = finalSetup.prompts.map((p) => out.find((r) => r.promptId === p.id)!).filter(Boolean);
    setResults(ordered);

    setBusy(true);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setup: finalSetup, results: ordered }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Report failed");
      setReport(data as Report);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        /* quota */
      }
      setStage("report");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("prompts");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStage("setup");
    setReport(null);
    setResults([]);
    setProfile(null);
    setSetup(null);
    setError(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-6">
      <Steps stage={stage} />
      {error && (
        <div className="rounded-md border border-bad/40 bg-bad/5 px-4 py-3 text-sm text-bad">{error}</div>
      )}

      {stage === "setup" && <SetupForm busy={busy} onSubmit={handleProfile} initialUrl={url} />}

      {stage === "prompts" && setup && (
        <PromptsEditor
          setup={setup}
          profile={profile}
          busy={busy}
          onBack={() => setStage("setup")}
          onRun={handleRun}
        />
      )}

      {stage === "running" && setup && (
        <RunProgress setup={setup} results={results} finishing={busy} />
      )}

      {stage === "report" && report && <ReportView report={report} onReset={reset} />}
    </div>
  );
}

async function runOne(prompt: Prompt, setup: Setup): Promise<PromptResult> {
  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt,
        brand: setup.brand,
        competitors: setup.competitors,
        market: setup.market,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Run failed");
    return data as PromptResult;
  } catch (e) {
    return {
      promptId: prompt.id,
      promptText: prompt.text,
      category: prompt.category,
      answer: "",
      citations: [],
      searchResults: [],
      searchQueries: [],
      mentions: [setup.brand, ...setup.competitors].map((b) => ({
        brand: b.name,
        mentioned: false,
        position: null,
        recommended: false,
        sentiment: "none" as const,
      })),
      otherBrands: [],
      usage: { inputTokens: 0, outputTokens: 0, searches: 0 },
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function mergeCompetitors(user: Brand[], suggested: Brand[]): Brand[] {
  const seen = new Set(user.map((c) => c.name.toLowerCase()));
  return [...user, ...suggested.filter((c) => !seen.has(c.name.toLowerCase()))];
}

function bare(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
}

function Steps({ stage }: { stage: Stage }) {
  const steps: { id: Stage; label: string }[] = [
    { id: "setup", label: "1 · Site" },
    { id: "prompts", label: "2 · Prompts & competitors" },
    { id: "running", label: "3 · Run" },
    { id: "report", label: "4 · Report" },
  ];
  const idx = steps.findIndex((s) => s.id === stage);
  return (
    <ol className="flex flex-wrap gap-2 text-xs">
      {steps.map((s, i) => (
        <li
          key={s.id}
          className={`rounded-full border px-3 py-1 ${
            i === idx ? "border-foreground bg-foreground text-background" : i < idx ? "border-line text-foreground" : "border-line text-muted"
          }`}
        >
          {s.label}
        </li>
      ))}
    </ol>
  );
}
