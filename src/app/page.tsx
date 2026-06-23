export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-50 p-8">
      <div className="max-w-lg text-center space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">
          ZaaZaa Marketing Agent
        </h1>
        <p className="text-zinc-400 text-lg">
          AI-powered social media marketing automation platform.
        </p>
        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-left space-y-2">
          <p className="text-sm text-zinc-500 uppercase tracking-widest font-medium">Status</p>
          <p className="text-green-400 font-mono text-sm">✓ Module 0 — Foundation complete</p>
          <p className="text-green-400 font-mono text-sm">✓ Module 1 — Multi-tenancy & auth</p>
          <p className="text-green-400 font-mono text-sm">✓ Module 2 — Credential vault</p>
          <p className="text-green-400 font-mono text-sm">✓ Module 3 — WooCommerce</p>
          <p className="text-green-400 font-mono text-sm">✓ Module 4 — Brand profile</p>
          <p className="text-green-400 font-mono text-sm">✓ Module 5 — Generation adapters</p>
          <p className="text-green-400 font-mono text-sm">✓ Module 6 — Content pipeline</p>
        </div>
      </div>
    </main>
  );
}
