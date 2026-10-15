import App from "@/components/App";

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">AI Visibility Audit</h1>
          <p className="text-sm text-muted">How a brand shows up when buyers ask Claude — and what to fix.</p>
        </div>
        <span className="font-mono text-xs text-muted">engine: Claude + web search</span>
      </header>
      <App />
    </main>
  );
}
