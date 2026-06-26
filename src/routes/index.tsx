import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
  Trash2,
  AlertCircle,
  Loader2,
  Copy,
  LogOut,
  CheckCircle2,
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

// ============ Types ============
type ChatMessage = {
  id: string;
  role: "user" | "agent";
  content: string;
  ts: number;
};

type HwPoint = { t: number; cpu: number; gpu: number };

type WalletState =
  | { status: "disconnected" }
  | { status: "connecting" }
  | { status: "connected"; address: string; balance: number }
  | { status: "error"; message: string };

type ModelHealth = "healthy" | "degraded" | "offline";

// ============ Constants ============
const STORAGE_CHAT = "pinode.chat.v1";
const STORAGE_WALLET = "pinode.wallet.v1";
const MAX_PROMPT_LEN = 2000;
const MIN_PROMPT_LEN = 2;

const PROMPT_TEMPLATES = [
  { label: "Summarize node logs", text: "Summarize the latest Pi-Node logs and flag anomalies." },
  { label: "Stake strategy", text: "Suggest a π staking strategy based on current network epoch." },
  { label: "Optimize GPU load", text: "How can I reduce GPU load while keeping inference latency under 100ms?" },
  { label: "Explain attestation", text: "Explain the zero-egress attestation hash in simple terms." },
  { label: "Tokenomics check", text: "Walk me through Pi tokenomics for a non-technical friend." },
];

const TIME_RANGES = [
  { id: "1m", label: "1m", points: 30, intervalMs: 2000 },
  { id: "5m", label: "5m", points: 60, intervalMs: 5000 },
  { id: "15m", label: "15m", points: 90, intervalMs: 10000 },
] as const;

type RangeId = (typeof TIME_RANGES)[number]["id"];

// ============ Helpers ============
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function fmtTime(ms: number) {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function randomPiAddress() {
  const chars = "0123456789abcdef";
  let a = "0x";
  for (let i = 0; i < 38; i++) a += chars[Math.floor(Math.random() * chars.length)];
  return a;
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function validatePrompt(input: string): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (trimmed.length < MIN_PROMPT_LEN) return { ok: false, error: "Prompt is too short." };
  if (trimmed.length > MAX_PROMPT_LEN) return { ok: false, error: `Keep prompts under ${MAX_PROMPT_LEN} characters.` };
  // basic safety: strip control chars
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B-\u001F\u007F]/.test(trimmed)) return { ok: false, error: "Prompt contains unsupported characters." };
  return { ok: true, value: trimmed };
}

function seedHardware(points: number): HwPoint[] {
  const now = Date.now();
  const arr: HwPoint[] = [];
  for (let i = points - 1; i >= 0; i--) {
    arr.push({
      t: now - i * 1000,
      cpu: 25 + Math.round(Math.random() * 25),
      gpu: 45 + Math.round(Math.random() * 30),
    });
  }
  return arr;
}

// ============ Dashboard ============
function Dashboard() {
  // ---- Wallet ----
  const [wallet, setWallet] = useState<WalletState>({ status: "disconnected" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_WALLET);
      if (raw) {
        const parsed = JSON.parse(raw) as WalletState;
        if (parsed?.status === "connected") setWallet(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      if (wallet.status === "connected") {
        localStorage.setItem(STORAGE_WALLET, JSON.stringify(wallet));
      } else if (wallet.status === "disconnected") {
        localStorage.removeItem(STORAGE_WALLET);
      }
    } catch {
      /* ignore */
    }
  }, [wallet]);

  const connectWallet = useCallback(async () => {
    setWallet({ status: "connecting" });
    try {
      await new Promise((r) => setTimeout(r, 1200));
      // 10% chance of simulated failure
      if (Math.random() < 0.08) throw new Error("User rejected the connection request.");
      setWallet({
        status: "connected",
        address: randomPiAddress(),
        balance: Math.round(Math.random() * 9000 * 100) / 100,
      });
    } catch (e) {
      setWallet({ status: "error", message: e instanceof Error ? e.message : "Connection failed." });
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setWallet({ status: "disconnected" });
  }, []);

  const copyAddress = useCallback(async () => {
    if (wallet.status !== "connected") return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }, [wallet]);

  // ---- Chat ----
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // hydrate from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_CHAT);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CHAT, JSON.stringify(messages.slice(-200)));
    } catch {
      /* ignore */
    }
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(
    (raw: string) => {
      const result = validatePrompt(raw);
      if (!result.ok) {
        setPromptError(result.error);
        return;
      }
      setPromptError(null);
      const userMsg: ChatMessage = { id: uid(), role: "user", content: result.value, ts: Date.now() };
      setMessages((m) => [...m, userMsg]);
      setPrompt("");
      setThinking(true);
      const delay = 700 + Math.random() * 900;
      setTimeout(() => {
        const reply: ChatMessage = {
          id: uid(),
          role: "agent",
          content: simulateAgentReply(result.value),
          ts: Date.now(),
        };
        setMessages((m) => [...m, reply]);
        setThinking(false);
        setTimeout(() => inputRef.current?.focus(), 0);
      }, delay);
    },
    [],
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_CHAT);
    } catch {
      /* ignore */
    }
  }, []);

  // ---- Hardware metrics (simulated, live) ----
  const [range, setRange] = useState<RangeId>("1m");
  const rangeCfg = useMemo(() => TIME_RANGES.find((r) => r.id === range)!, [range]);
  const [hw, setHw] = useState<HwPoint[]>(() => seedHardware(30));

  useEffect(() => {
    setHw((prev) => {
      const needed = rangeCfg.points;
      if (prev.length >= needed) return prev.slice(-needed);
      return [...seedHardware(needed - prev.length), ...prev];
    });
  }, [rangeCfg.points]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setHw((prev) => {
        const last = prev[prev.length - 1];
        const drift = (v: number, lo: number, hi: number) => {
          const next = v + (Math.random() - 0.5) * 14 + (thinking ? 6 : -1);
          return Math.max(lo, Math.min(hi, Math.round(next)));
        };
        const next: HwPoint = {
          t: Date.now(),
          cpu: drift(last?.cpu ?? 30, 8, 70),
          gpu: drift(last?.gpu ?? 55, 20, 95),
        };
        return [...prev, next].slice(-rangeCfg.points);
      });
    }, rangeCfg.intervalMs);
    return () => window.clearInterval(id);
  }, [rangeCfg, thinking]);

  const latest = hw[hw.length - 1] ?? { cpu: 0, gpu: 0, t: 0 };
  const avgCpu = Math.round(hw.reduce((a, b) => a + b.cpu, 0) / Math.max(1, hw.length));
  const avgGpu = Math.round(hw.reduce((a, b) => a + b.gpu, 0) / Math.max(1, hw.length));

  // ---- AI model health (simulated) ----
  const [tokensPerSec, setTokensPerSec] = useState(47.2);
  const [uptimePct, setUptimePct] = useState(99.94);
  const [inferences, setInferences] = useState(12408);
  const [contextTokens, setContextTokens] = useState(8214);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTokensPerSec((v) => Math.max(18, Math.min(72, +(v + (Math.random() - 0.5) * 4).toFixed(1))));
      setInferences((v) => v + Math.floor(Math.random() * 3));
      setContextTokens((v) => Math.max(1024, Math.min(128000, v + Math.floor((Math.random() - 0.4) * 400))));
      setUptimePct((v) => +(Math.min(99.99, Math.max(99.5, v + (Math.random() - 0.5) * 0.02))).toFixed(2));
    }, 1500);
    return () => window.clearInterval(id);
  }, []);

  const health: ModelHealth = useMemo(() => {
    if (latest.gpu > 92 || latest.cpu > 88) return "degraded";
    if (tokensPerSec < 22) return "degraded";
    return "healthy";
  }, [latest, tokensPerSec]);

  const healthMeta = {
    healthy: { label: "Local Compute Active", color: "success", ring: "border-success/30 bg-success/10", dot: "bg-success" },
    degraded: { label: "Throttling — High Load", color: "amber", ring: "border-amber-400/30 bg-amber-400/10", dot: "bg-amber-400" },
    offline: { label: "Compute Offline", color: "destructive", ring: "border-destructive/30 bg-destructive/10", dot: "bg-destructive" },
  }[health];

  // ---- Render ----
  return (
    <div className="min-h-screen text-foreground">
      <Header
        wallet={wallet}
        copied={copied}
        onConnect={connectWallet}
        onDisconnect={disconnectWallet}
        onCopy={copyAddress}
      />

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
            <span className="text-xs font-mono text-muted-foreground">
              {wallet.status === "connected" ? `node.${shortAddr(wallet.address)}` : "node.0xA1f8…3b2c"}
            </span>
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

        {/* Top Row: Engine Status + Trust Layer */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 glass-card rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
            <div className="relative flex items-start justify-between gap-4 flex-wrap">
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

              <div className={`flex items-center gap-2 pl-3 pr-3.5 py-1.5 rounded-full border ${healthMeta.ring}`}>
                <span className="relative flex w-2 h-2">
                  <span className={`absolute inset-0 rounded-full ${healthMeta.dot} pulse-dot`} />
                  <span className={`relative rounded-full w-2 h-2 ${healthMeta.dot}`} />
                </span>
                <span className={`text-xs font-medium ${health === "healthy" ? "text-success" : health === "degraded" ? "text-amber-400" : "text-destructive"}`}>
                  {healthMeta.label}
                </span>
              </div>
            </div>

            <div className="relative mt-8 grid grid-cols-2 md:grid-cols-4 gap-px bg-border/40 rounded-xl overflow-hidden">
              {[
                { label: "Tokens / sec", value: tokensPerSec.toFixed(1), sub: thinking ? "inference active" : "idle" },
                { label: "Active context", value: contextTokens.toLocaleString(), sub: "tokens loaded" },
                { label: "Uptime", value: `${uptimePct.toFixed(2)}%`, sub: "last 30 days" },
                { label: "Inferences", value: inferences.toLocaleString(), sub: "today" },
              ].map((s) => (
                <div key={s.label} className="bg-card/80 px-4 py-4">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
                  <div className="mt-1 font-display text-xl font-semibold tabular-nums">{s.value}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{s.sub}</div>
                </div>
              ))}
            </div>
          </div>

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
          <HardwareCard
            data={hw}
            range={range}
            onRangeChange={setRange}
            latest={latest}
            avgCpu={avgCpu}
            avgGpu={avgGpu}
          />

          <ChatCard
            messages={messages}
            prompt={prompt}
            setPrompt={(v) => {
              setPrompt(v);
              if (promptError) setPromptError(null);
            }}
            promptError={promptError}
            onSend={() => sendMessage(prompt)}
            onTemplate={(t) => {
              setPrompt(t);
              setPromptError(null);
              inputRef.current?.focus();
            }}
            onClear={clearChat}
            thinking={thinking}
            scrollRef={scrollRef}
            inputRef={inputRef}
          />
        </section>

        <footer className="pt-6 pb-2 flex items-center justify-between text-xs text-muted-foreground border-t border-border/40">
          <div className="font-mono">Pi-Node AI Core · v0.4.2-beta</div>
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${healthMeta.dot} pulse-dot`} />
            {health === "healthy" ? "All systems nominal" : health === "degraded" ? "Elevated load detected" : "Compute offline"}
          </div>
        </footer>
      </main>
    </div>
  );
}

// ============ Header ============
function Header({
  wallet,
  copied,
  onConnect,
  onDisconnect,
  onCopy,
}: {
  wallet: WalletState;
  copied: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onCopy: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (wallet.status !== "connected") setOpen(false);
  }, [wallet.status]);

  return (
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

        <div className="flex items-center gap-3">
          {wallet.status === "error" && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5" />
              <span className="max-w-[180px] truncate">{wallet.message}</span>
            </div>
          )}

          {wallet.status !== "connected" ? (
            <button
              onClick={onConnect}
              disabled={wallet.status === "connecting"}
              className="group relative inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-gradient-to-r from-primary to-accent text-primary-foreground text-sm font-medium glow-violet hover:brightness-110 transition disabled:opacity-70 disabled:cursor-wait"
            >
              {wallet.status === "connecting" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wallet className="w-4 h-4" />
              )}
              {wallet.status === "connecting" ? "Connecting…" : "Connect Pi Wallet"}
              {wallet.status !== "connecting" && (
                <ArrowUpRight className="w-3.5 h-3.5 opacity-70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              )}
            </button>
          ) : (
            <div className="relative">
              <button
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-2.5 pl-2 pr-3 h-10 rounded-lg border border-border/70 bg-card/60 hover:bg-card transition text-sm"
              >
                <span className="relative flex w-2 h-2">
                  <span className="absolute inset-0 rounded-full bg-success pulse-dot" />
                  <span className="relative rounded-full w-2 h-2 bg-success" />
                </span>
                <span className="font-mono text-xs">{shortAddr(wallet.address)}</span>
                <span className="w-px h-4 bg-border" />
                <span className="font-display font-semibold">π {wallet.balance.toFixed(2)}</span>
              </button>
              {open && (
                <div className="absolute right-0 mt-2 w-72 glass-card rounded-xl p-4 shadow-xl">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pi Wallet</div>
                  <div className="mt-1 font-mono text-xs text-foreground break-all">{wallet.address}</div>
                  <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
                    <span className="text-xs text-muted-foreground">Balance</span>
                    <span className="font-display font-semibold">π {wallet.balance.toFixed(2)}</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={onCopy}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-border/70 hover:border-primary/50 text-xs transition"
                    >
                      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Copied" : "Copy address"}
                    </button>
                    <button
                      onClick={onDisconnect}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 text-xs transition"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Disconnect
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// ============ Hardware Card ============
function HardwareCard({
  data,
  range,
  onRangeChange,
  latest,
  avgCpu,
  avgGpu,
}: {
  data: HwPoint[];
  range: RangeId;
  onRangeChange: (r: RangeId) => void;
  latest: HwPoint;
  avgCpu: number;
  avgGpu: number;
}) {
  const chartData = useMemo(
    () => data.map((d) => ({ ...d, label: fmtTime(d.t) })),
    [data],
  );

  return (
    <div className="lg:col-span-3 glass-card rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <Cpu className="w-3.5 h-3.5 text-primary" /> Hardware Transparency
          </div>
          <h3 className="mt-2 font-display text-xl font-semibold">Local Compute Allocation</h3>
        </div>
        <div className="flex items-center gap-3">
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
          <div className="flex items-center rounded-lg border border-border/70 p-0.5 text-xs">
            {TIME_RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => onRangeChange(r.id)}
                className={`px-2.5 py-1 rounded-md transition ${
                  range === r.id
                    ? "bg-primary/20 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="h-64 -ml-3 mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} stackOffset="none">
            <defs>
              <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.65 0.22 295)" stopOpacity={0.8} />
                <stop offset="100%" stopColor="oklch(0.65 0.22 295)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gpuGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.82 0.16 200)" stopOpacity={0.7} />
                <stop offset="100%" stopColor="oklch(0.82 0.16 200)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.05)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "oklch(0.68 0.03 280)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={32}
            />
            <YAxis
              tick={{ fill: "oklch(0.68 0.03 280)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              unit="%"
              domain={[0, 200]}
            />
            <Tooltip content={<HwTooltip />} cursor={{ stroke: "oklch(1 0 0 / 0.15)", strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="cpu"
              stackId="load"
              stroke="oklch(0.65 0.22 295)"
              strokeWidth={2}
              fill="url(#cpuGrad)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="gpu"
              stackId="load"
              stroke="oklch(0.82 0.16 200)"
              strokeWidth={2}
              fill="url(#gpuGrad)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          { label: "CPU", value: `${latest.cpu}%`, detail: `avg ${avgCpu}% · 8c / 16t` },
          { label: "GPU", value: `${latest.gpu}%`, detail: `avg ${avgGpu}% · VRAM 6.2 / 12 GB` },
          { label: "Memory", value: "11.4 GB", detail: "of 32 GB" },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-border/60 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{m.label}</span>
              <Activity className="w-3 h-3 text-primary" />
            </div>
            <div className="font-display text-xl font-semibold mt-1 tabular-nums">{m.value}</div>
            <div className="text-[11px] text-muted-foreground font-mono">{m.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HwTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const cpu = payload.find((p) => p.name === "cpu")?.value ?? 0;
  const gpu = payload.find((p) => p.name === "gpu")?.value ?? 0;
  return (
    <div className="rounded-lg border border-border/70 bg-card/95 backdrop-blur px-3 py-2 text-xs shadow-xl">
      <div className="font-mono text-muted-foreground mb-1.5">{label}</div>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="w-2 h-2 rounded-sm bg-primary" />
        <span className="text-muted-foreground">CPU</span>
        <span className="ml-auto font-mono tabular-nums text-foreground">{cpu}%</span>
      </div>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-sm bg-[color:var(--cyan-glow)]" />
        <span className="text-muted-foreground">GPU</span>
        <span className="ml-auto font-mono tabular-nums text-foreground">{gpu}%</span>
      </div>
      <div className="pt-1 mt-1 border-t border-border/60 flex items-center gap-2">
        <span className="text-muted-foreground">Combined</span>
        <span className="ml-auto font-mono tabular-nums text-foreground">{cpu + gpu}%</span>
      </div>
    </div>
  );
}

// ============ Chat Card ============
function ChatCard({
  messages,
  prompt,
  setPrompt,
  promptError,
  onSend,
  onTemplate,
  onClear,
  thinking,
  scrollRef,
  inputRef,
}: {
  messages: ChatMessage[];
  prompt: string;
  setPrompt: (v: string) => void;
  promptError: string | null;
  onSend: () => void;
  onTemplate: (t: string) => void;
  onClear: () => void;
  thinking: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const charCount = prompt.trim().length;
  const overLimit = charCount > MAX_PROMPT_LEN;

  return (
    <div className="lg:col-span-2 glass-card rounded-2xl p-6 flex flex-col relative overflow-hidden">
      <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-accent/30 blur-3xl pointer-events-none" />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <Zap className="w-3.5 h-3.5 text-primary" /> Local Agent
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={onClear}
              className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-destructive transition"
              title="Clear chat history"
            >
              <Trash2 className="w-3 h-3" />
              clear
            </button>
          )}
          <span className="text-[10px] font-mono text-muted-foreground">session · 1f3a</span>
        </div>
      </div>
      <h3 className="relative mt-2 font-display text-xl font-semibold">Chat with your Local AI</h3>
      <p className="relative text-sm text-muted-foreground mt-1">
        Distraction-free. Every token computed on your node.
      </p>

      <div
        ref={scrollRef}
        className="relative flex-1 mt-5 rounded-xl border border-border/60 bg-background/40 p-4 space-y-4 min-h-[240px] max-h-[360px] overflow-y-auto"
      >
        {messages.length === 0 ? (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
              <CircuitBoard className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <div className="text-sm leading-relaxed">
              <div className="text-xs text-muted-foreground mb-1">Pi-Node Agent</div>
              Node online. Running Llama-3-8B locally. Ask anything — your prompt won't leave this machine.
            </div>
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} m={m} />)
        )}
        {thinking && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
              <CircuitBoard className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <div className="text-sm text-muted-foreground inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary pulse-dot" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary pulse-dot" style={{ animationDelay: "0.2s" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-primary pulse-dot" style={{ animationDelay: "0.4s" }} />
            </div>
          </div>
        )}
      </div>

      <div className="relative mt-4">
        <div
          className={`flex items-center gap-2 rounded-xl border bg-input/50 transition pl-4 pr-2 py-2 ${
            promptError || overLimit
              ? "border-destructive/60 ring-2 ring-destructive/20"
              : "border-border focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20"
          }`}
        >
          <input
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Try a Pi-powered prompt…"
            maxLength={MAX_PROMPT_LEN + 100}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <button
            onClick={onSend}
            disabled={thinking || charCount < MIN_PROMPT_LEN || overLimit}
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {thinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>

        <div className="mt-1.5 flex items-center justify-between text-[11px]">
          <div className="text-destructive flex items-center gap-1 min-h-[14px]">
            {promptError && (
              <>
                <AlertCircle className="w-3 h-3" />
                {promptError}
              </>
            )}
          </div>
          <span className={`font-mono ${overLimit ? "text-destructive" : "text-muted-foreground"}`}>
            {charCount}/{MAX_PROMPT_LEN}
          </span>
        </div>

        <div className="mt-2.5 flex items-start gap-2 text-[11px] text-muted-foreground flex-wrap">
          <Sparkles className="w-3 h-3 text-primary mt-1" />
          <span className="mt-0.5">Templates:</span>
          {PROMPT_TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => onTemplate(t.text)}
              className="px-2 py-0.5 rounded-md border border-border/60 hover:border-primary/50 hover:text-foreground transition"
              title={t.text}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Bubble({ m }: { m: ChatMessage }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%]">
          <div className="text-[10px] text-muted-foreground text-right mb-1 font-mono">{fmtTime(m.ts)}</div>
          <div className="rounded-xl rounded-tr-sm bg-primary/20 border border-primary/30 px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {m.content}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-md bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
        <CircuitBoard className="w-3.5 h-3.5 text-primary-foreground" />
      </div>
      <div className="max-w-[85%]">
        <div className="text-[10px] text-muted-foreground mb-1 font-mono">Pi-Node Agent · {fmtTime(m.ts)}</div>
        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.content}</div>
      </div>
    </div>
  );
}

// ============ Simulated agent ============
function simulateAgentReply(prompt: string): string {
  const p = prompt.toLowerCase();
  if (p.includes("stake") || p.includes("π") || p.includes("pi"))
    return "Based on the current epoch and your node uptime, compounding a 30-day lockup yields the best risk-adjusted return. I can draft a staking schedule if you'd like.";
  if (p.includes("log"))
    return "Scanned the last 24h of node logs. 0 critical errors, 3 warnings (all transient peer disconnects). Inference pipeline nominal.";
  if (p.includes("gpu") || p.includes("optimize"))
    return "Reduce GPU load by lowering the q4_K_M batch size from 8 → 4, enabling KV-cache offload, and capping context to 16k for chat tasks. Expected drop: ~22% VRAM.";
  if (p.includes("attest"))
    return "The attestation hash is a signed digest of (model weights + runtime config + node identity). Anyone with your public key can verify your AI hasn't been tampered with.";
  return "Processed locally on your Pi Node. Here's a draft response — refine the prompt for more specific reasoning, longer context, or step-by-step output.";
}
