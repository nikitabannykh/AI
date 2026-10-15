"use client";

import { useState } from "react";
import type { Brand } from "@/lib/types";

type Props = {
  busy: boolean;
  initialUrl?: string;
  onSubmit: (input: { url: string; language: string; competitors: Brand[]; promptCount: number }) => void;
};

export default function SetupForm({ busy, initialUrl = "", onSubmit }: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [language, setLanguage] = useState("English");
  const [competitorsText, setCompetitorsText] = useState("");
  const [promptCount, setPromptCount] = useState(20);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const competitors: Brand[] = competitorsText
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        // "Dalet dalet.com" | "Dalet (dalet.com)" | "Dalet"
        const m = /^(.*?)[\s(]+([a-z0-9.-]+\.[a-z]{2,})\)?$/i.exec(s);
        return m ? { name: m[1].trim(), domain: m[2].toLowerCase() } : { name: s, domain: "" };
      });
    onSubmit({ url: url.trim(), language, competitors, promptCount });
  }

  return (
    <form onSubmit={submit} className="card grid gap-5 md:grid-cols-2">
      <div className="md:col-span-2">
        <label className="label">Website to audit</label>
        <input
          className="input"
          placeholder="octopus-news.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <p className="mt-1 text-xs text-muted">
          We read the homepage, detect the product category, propose competitors and draft the buyer questions.
        </p>
      </div>

      <div>
        <label className="label">Competitors (optional, one per line: Name domain)</label>
        <textarea
          className="input h-32 font-mono text-xs"
          placeholder={"Dalet dalet.com\nAvid iNEWS avid.com\nCuez cuez.app"}
          value={competitorsText}
          onChange={(e) => setCompetitorsText(e.target.value)}
        />
      </div>

      <div className="space-y-4">
        <div>
          <label className="label">Prompt language</label>
          <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {["English", "German", "Czech", "Spanish", "French", "Russian"].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Number of prompts</label>
          <input
            type="number"
            min={5}
            max={60}
            className="input"
            value={promptCount}
            onChange={(e) => setPromptCount(Number(e.target.value))}
          />
          <p className="mt-1 text-xs text-muted">Each prompt ≈ 1 Claude answer with up to 5 web searches + 1 extraction call.</p>
        </div>
      </div>

      <div className="md:col-span-2 flex justify-end">
        <button className="btn-primary" disabled={busy || !url}>
          {busy ? "Reading site…" : "Analyse site →"}
        </button>
      </div>
    </form>
  );
}
