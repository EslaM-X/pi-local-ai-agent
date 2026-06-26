import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Wallet,
  Shield,
  Cpu,
  Zap,
  ArrowUpRight,
  Sparkles,
  Send,
  Activity,
  Lock,
  Network,
  CircuitBoard,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pi-Node AI Core — Decentralized On-Device AI" },
      { name: "description", content: "Run private, local AI on your Pi Node. Llama-3-8B compute stays on your hardware." },
    ],
  }),
  component: Dashboard,
});

const chartData = [
  { t: "00:00", cpu: 22, gpu: 41 },
  { t: "00:05", cpu: 31, gpu: 52 },
  { t: "00:10", cpu: 28, gpu: 48 },
  { t: "00:15", cpu: 44, gpu: 67 },
  { t: "00:20", cpu: 39, gpu: 71 },
  { t: "00:25", cpu: 52, gpu: 78 },
  { t: "00:30", cpu: 47, gpu: 84 },
  { t: "00:35", cpu: 58, gpu: 76 },
  { t: "00:40", cpu: 41, gpu: 69 },
  { t: "00:45", cpu: 36, gpu: 62 },
  { t: "00:50", cpu: 49, gpu: 73 },
  { t: "00:55", cpu: 43, gpu: 68 },
];

function Dashboard() {
  const [walletConnected, setWalletConnected] = useState(false);
  const [prompt, setPrompt] = useState("");

  return (
    <div className="min-h-screen text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 backdrop-blur-xl bg-background/40">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="absolute inset-0 blur-md bg-primary/60" />
                <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <CircuitBoard className="w-4 h-4 text-primary-foreground" />
                </div>
              </div>
              <div className="font-display font-semibold tracking-tight text-lg">
                Pi-Node <span className="text-gradient-violet">AI Core</span>
              </div>
            </div>
            <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
              <a className="text-foreground" href="#">Dashboard</a>
              <a className="hover:text-foreground transition" href="#">Models</a>
              <a className="hover:text-foreground transition" href="#">Network</a>
              <a className="hover:text-foreground transition" href="#">Logs</a>
            </nav>
          </div>
          <button
            onClick={() => setWalletConnected(!walletConnected)}
            className="group relative inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-gradient-to-r from-primary to-accent text-primary-foreground text-sm font-medium glow-violet hover:brightness-110 transition"
          >
            <Wallet className="w-4 h-4" />
            {walletConnected ? "π · 4823.91" : "Connect Pi Wallet"}
            <ArrowUpRight className="w-3.5 h-3.5 opacity-70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10 space-y-8">
        {/* Privacy Badge + Title */}
        <section className="flex flex-col gap-5">
          <div className="inline-flex w-fit items-center gap-2.5 pl-2 pr-4 py-1.5 rounded-full glass-card">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-success/15">
              <Shield className="w-3.5 h-3.5 text-success" />
            </span>
            <span className="text-xs font-medium tracking-wide">
              Privacy-First · <span className="text-muted-foreground">Data Stays on Your Node</span>
            </span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span className="text-xs font-mono text-muted-foreground">node.0xA1f8…3b2c</span>
          </div>

          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
                Local intelligence,{" "}
                <span className="text-gradient-violet">verifiably yours.</span>
              </h1>
              <p className="mt-3 text-muted-foreground max-w-xl">
                Your AI agent runs entirely on your Pi Node. No prompts, no embeddings,
                and no telemetry ever leave your hardware.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <Network className="w-3.5 h-3.5" />
              <span>Mainnet · Epoch 14,892</span>
            </div>
          </div>
        </section>

        {/* Top Row: Engine Status + Quick Stats */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* AI Engine Status — wide card */}
          <div className="lg:col-span-2 glass-card rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
            <div className="relative flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <Sparkles className="w-3.5 h-3.5 text-primary" /> AI Engine
                </div>
                <div className="mt-3 flex items-baseline gap-3">
                  <h2 className="text-3xl font-display font-semibold">Llama-3-8B</h2>
                  <span className="text-xs font-mono text-muted-foreground">q4_K_M · 4.7 GB</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Quantized inference engine · 128k context window
                </p>
              </div>

              <div className="flex items-center gap-2 pl-3 pr-3.5 py-1.5 rounded-full border border-success/30 bg-success/10">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inset-0 rounded-full bg-success pulse-dot" />
                  <span className="relative rounded-full w-2 h-2 bg-success" />
                </span>
                <span className="text-xs font-medium text-success">Local Compute Active</span>
              </div>
            </div>

            <div className="relative mt-8 grid grid-cols-2 md:grid-cols-4 gap-px bg-border/40 rounded-xl overflow-hidden">
              {[
                { label: "Tokens / sec", value: "47.2", sub: "↑ 12% vs avg" },
                { label: "Active context", value: "8,214", sub: "tokens loaded" },
                { label: "Uptime", value: "99.94%", sub: "last 30 days" },
                { label: "Inferences", value: "12,408", sub: "today" },
              ].map((s) => (
                <div key={s.label} className="bg-card/80 px-4 py-4">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
                  <div className="mt-1 font-display text-xl font-semibold">{s.value}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{s.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Privacy guarantees card */}
          <div className="glass-card rounded-2xl p-6 flex flex-col">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <Lock className="w-3.5 h-3.5 text-primary" /> Trust Layer
            </div>
            <h3 className="mt-3 font-display text-lg font-semibold">Zero-egress guarantee</h3>
            <div className="mt-5 space-y-3 flex-1">
              {[
                { label: "On-device inference", v: true },
                { label: "No telemetry beacons", v: true },
                { label: "End-to-end encrypted", v: true },
                { label: "Open weights & verifiable", v: true },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="font-mono text-xs text-success">VERIFIED</span>
                </div>
              ))}
            </div>
            <div className="mt-5 pt-5 border-t border-border/60 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Attestation hash</span>
              <span className="font-mono text-foreground">0x8e2…f019</span>
            </div>
          </div>
        </section>

        {/* Hardware Chart + Chat */}
        <section className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Hardware transparency */}
          <div className="lg:col-span-3 glass-card rounded-2xl p-6">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <Cpu className="w-3.5 h-3.5 text-primary" /> Hardware Transparency
                </div>
                <h3 className="mt-2 font-display text-xl font-semibold">Local Compute Allocation</h3>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-primary" />
                  <span className="text-muted-foreground">CPU</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[color:var(--cyan-glow)]" />
                  <span className="text-muted-foreground">GPU</span>
                </div>
              </div>
            </div>

            <div className="h-64 -ml-3 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.65 0.22 295)" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="oklch(0.65 0.22 295)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gpuGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.82 0.16 200)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="oklch(0.82 0.16 200)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.05)" vertical={false} />
                  <XAxis dataKey="t" tick={{ fill: "oklch(0.68 0.03 280)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "oklch(0.68 0.03 280)", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.18 0.035 285)",
                      border: "1px solid oklch(1 0 0 / 0.08)",
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "oklch(0.68 0.03 280)" }}
                  />
                  <Area type="monotone" dataKey="gpu" stroke="oklch(0.82 0.16 200)" strokeWidth={2} fill="url(#gpuGrad)" />
                  <Area type="monotone" dataKey="cpu" stroke="oklch(0.65 0.22 295)" strokeWidth={2} fill="url(#cpuGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { label: "CPU", value: "43%", detail: "8c / 16t · 3.2 GHz" },
                { label: "GPU", value: "68%", detail: "VRAM 6.2 / 12 GB" },
                { label: "Memory", value: "11.4 GB", detail: "of 32 GB" },
              ].map((m) => (
                <div key={m.label} className="rounded-xl border border-border/60 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{m.label}</span>
                    <Activity className="w-3 h-3 text-primary" />
                  </div>
                  <div className="font-display text-xl font-semibold mt-1">{m.value}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">{m.detail}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Chat */}
          <div className="lg:col-span-2 glass-card rounded-2xl p-6 flex flex-col relative overflow-hidden">
            <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-accent/30 blur-3xl pointer-events-none" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <Zap className="w-3.5 h-3.5 text-primary" /> Local Agent
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">session · 1f3a</span>
            </div>
            <h3 className="relative mt-2 font-display text-xl font-semibold">
              Chat with your Local AI
            </h3>
            <p className="relative text-sm text-muted-foreground mt-1">
              Distraction-free. Every token computed on your node.
            </p>

            <div className="relative flex-1 mt-5 rounded-xl border border-border/60 bg-background/40 p-4 space-y-4 min-h-[220px]">
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-md bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
                  <CircuitBoard className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
                <div className="text-sm leading-relaxed">
                  <div className="text-xs text-muted-foreground mb-1">Pi-Node Agent</div>
                  Node online. Running Llama-3-8B locally. Ask anything — your prompt won't leave this machine.
                </div>
              </div>
            </div>

            <div className="relative mt-4">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-input/50 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition pl-4 pr-2 py-2">
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Try a Pi-powered prompt…"
                  className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                />
                <button className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground hover:brightness-110 transition">
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                <Sparkles className="w-3 h-3 text-primary" />
                <span>Suggested:</span>
                {["Summarize my node logs", "Stake strategy for π", "Optimize GPU load"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setPrompt(s)}
                    className="px-2 py-0.5 rounded-md border border-border/60 hover:border-primary/50 hover:text-foreground transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="pt-6 pb-2 flex items-center justify-between text-xs text-muted-foreground border-t border-border/40">
          <div className="font-mono">Pi-Node AI Core · v0.4.2-beta</div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-success pulse-dot" />
            All systems nominal
          </div>
        </footer>
      </main>
    </div>
  );
}
