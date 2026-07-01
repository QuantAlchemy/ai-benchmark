import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bot,
  CheckCircle2,
  Clipboard,
  FileCheck2,
  FileText,
  Folder,
  Loader2,
  Play,
  RefreshCw,
  ScrollText,
  Terminal,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createBenchmarkScorecard,
  loadBenchmarkAgents,
  loadBenchmarkFiles,
  loadDashboard,
  runBenchmarkAgentAction,
  runBenchmarkAction,
} from "@/lib/benchmarks.functions";
import { cn } from "@/lib/utils";
import type { BenchmarkAgent, CommandResult, DashboardBenchmark } from "@/lib/benchmarks.server";

type BenchmarkFiles = Awaited<ReturnType<typeof loadBenchmarkFiles>>;
type ActiveRun = "setup" | "verify" | "agent" | "score" | "refresh" | null;

export const Route = createFileRoute("/")({
  loader: async () => {
    const benchmarks = await loadDashboard();
    const agents = await loadBenchmarkAgents();
    const initialFiles = benchmarks[0] ? await loadBenchmarkFiles({ data: { id: benchmarks[0].id } }) : null;
    return { benchmarks, agents, initialFiles };
  },
  component: BenchmarkDashboard,
});

function BenchmarkDashboard() {
  const loaded = Route.useLoaderData();
  const loadedBenchmarks = loaded.benchmarks;
  const loadedAgents = loaded.agents;
  const [benchmarks, setBenchmarks] = React.useState<DashboardBenchmark[]>(loadedBenchmarks);
  const [agents, setAgents] = React.useState<BenchmarkAgent[]>(loadedAgents);
  const [selectedId, setSelectedId] = React.useState(loadedBenchmarks[0]?.id ?? "");
  const selectedBenchmark = benchmarks.find((benchmark) => benchmark.id === selectedId) ?? benchmarks[0];
  const [solutionPath, setSolutionPath] = React.useState(selectedBenchmark?.defaultSolution ?? "");
  const [scoreModel, setScoreModel] = React.useState("candidate");
  const [agentId, setAgentId] = React.useState(loadedAgents.find((agent) => agent.available)?.id ?? loadedAgents[0]?.id ?? "codex");
  const [agentModel, setAgentModel] = React.useState("");
  const [forceScorecard, setForceScorecard] = React.useState(false);
  const [files, setFiles] = React.useState<BenchmarkFiles | null>(loaded.initialFiles);
  const [activeRun, setActiveRun] = React.useState<ActiveRun>(null);
  const [result, setResult] = React.useState<CommandResult | null>(null);
  const [documentTab, setDocumentTab] = React.useState("task");
  const [copied, setCopied] = React.useState<string | null>(null);

  React.useEffect(() => setBenchmarks(loadedBenchmarks), [loadedBenchmarks]);
  React.useEffect(() => setAgents(loadedAgents), [loadedAgents]);

  React.useEffect(() => {
    if (!selectedBenchmark) return;
    setSolutionPath(selectedBenchmark.defaultSolution);
    if (files?.benchmark.id === selectedBenchmark.id) return;
    setFiles(null);
    let cancelled = false;

    loadBenchmarkFiles({ data: { id: selectedBenchmark.id } }).then((nextFiles) => {
      if (!cancelled) setFiles(nextFiles);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedBenchmark?.id]);

  async function refreshDashboard() {
    setActiveRun("refresh");
    const [nextBenchmarks, nextAgents] = await Promise.all([loadDashboard(), loadBenchmarkAgents()]);
    setBenchmarks(nextBenchmarks);
    setAgents(nextAgents);
    setActiveRun(null);
  }

  async function runAction(action: "setup" | "verify") {
    if (!selectedBenchmark) return;
    setActiveRun(action);
    setResult(null);
    const nextResult = await runBenchmarkAction({
      data: {
        id: selectedBenchmark.id,
        action,
        solution: solutionPath,
      },
    });
    setResult(nextResult);
    await refreshDashboard();
  }

  async function runAgent() {
    if (!selectedBenchmark) return;
    setActiveRun("agent");
    setResult(null);
    const nextResult = await runBenchmarkAgentAction({
      data: {
        id: selectedBenchmark.id,
        agent: agentId,
        model: agentModel,
        solution: solutionPath,
      },
    });
    setResult(nextResult);
    await refreshDashboard();
  }

  async function createScore() {
    if (!selectedBenchmark) return;
    setActiveRun("score");
    setResult(null);
    const nextResult = await createBenchmarkScorecard({
      data: {
        id: selectedBenchmark.id,
        model: scoreModel,
        force: forceScorecard,
      },
    });
    setResult(nextResult);
    await refreshDashboard();
  }

  async function copyDocument(key: "task" | "rubric" | "readme" | "output") {
    const text =
      key === "output"
        ? (result?.output ?? "")
        : key === "task"
          ? (files?.task ?? "")
          : key === "rubric"
            ? (files?.rubric ?? "")
            : (files?.readme ?? "");
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1400);
  }

  if (!selectedBenchmark) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>No benchmarks found</CardTitle>
            <CardDescription>Add a folder under benchmarks/ with a benchmark.json manifest.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const running = activeRun !== null;
  const selectedAgent = agents.find((agent) => agent.id === agentId) ?? agents[0];
  const documentText =
    documentTab === "task" ? files?.task : documentTab === "rubric" ? files?.rubric : files?.readme;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,oklch(0.96_0.04_178),transparent_34rem)]">
      <header className="border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Terminal className="size-5 text-primary" aria-hidden="true" />
              <h1 className="text-xl font-semibold tracking-normal">ai-benchmark</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Setup, prompts, verification, rubrics, and scorecards for model benchmark runs.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refreshDashboard} disabled={running}>
            <RefreshCw className={cn("size-4", activeRun === "refresh" && "animate-spin")} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[20rem_1fr]">
        <aside className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">Benchmarks</h2>
            <Badge variant="secondary">{benchmarks.length}</Badge>
          </div>
          <div className="grid gap-2">
            {benchmarks.map((benchmark) => (
              <button
                key={benchmark.id}
                type="button"
                className={cn(
                  "rounded-lg border bg-card p-4 text-left shadow-xs transition-colors hover:border-primary/40",
                  selectedBenchmark.id === benchmark.id && "border-primary ring-2 ring-ring/25",
                )}
                onClick={() => setSelectedId(benchmark.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{benchmark.id}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{benchmark.summary}</div>
                  </div>
                  <StatusIcon ok={benchmark.sourceFetched} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {benchmark.difficulty ? <Badge variant="outline">{benchmark.difficulty}</Badge> : null}
                  {benchmark.solutionExists ? <Badge variant="success">solution</Badge> : <Badge variant="secondary">no solution</Badge>}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-4">
          <Card>
            <CardHeader className="gap-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-lg">{selectedBenchmark.name}</CardTitle>
                    <Badge variant={selectedBenchmark.sourceFetched ? "success" : "warning"}>
                      {selectedBenchmark.sourceFetched ? "source ready" : "needs setup"}
                    </Badge>
                  </div>
                  <CardDescription className="mt-2 max-w-3xl">{selectedBenchmark.summary}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedBenchmark.category ? <Badge variant="secondary">{selectedBenchmark.category}</Badge> : null}
                  {selectedBenchmark.difficulty ? <Badge variant="outline">{selectedBenchmark.difficulty}</Badge> : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3 lg:grid-cols-[1fr_16rem]">
                <div className="space-y-2">
                  <Label htmlFor="solution-path">Solution path</Label>
                  <div className="relative">
                    <Folder className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="solution-path"
                      value={solutionPath}
                      onChange={(event) => setSolutionPath(event.target.value)}
                      className="pl-9 font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="score-model-name">Scorecard model</Label>
                  <Input id="score-model-name" value={scoreModel} onChange={(event) => setScoreModel(event.target.value)} />
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[16rem_1fr]">
                <div className="space-y-2">
                  <Label htmlFor="agent-select">Agent</Label>
                  <select
                    id="agent-select"
                    value={agentId}
                    onChange={(event) => setAgentId(event.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={running}
                  >
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id} disabled={!agent.available}>
                        {agent.label}
                        {agent.available ? "" : agent.planned ? " (planned)" : " (missing)"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agent-model-name">Agent model override</Label>
                  <Input
                    id="agent-model-name"
                    value={agentModel}
                    onChange={(event) => setAgentModel(event.target.value)}
                    placeholder="Use CLI default"
                  />
                </div>
              </div>
              {selectedAgent ? (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {selectedAgent.version || selectedAgent.status}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Button onClick={runAgent} disabled={running || !selectedAgent?.available}>
                    {activeRun === "agent" ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}
                    Run agent
                  </Button>
                  <Button onClick={() => runAction("setup")} disabled={running}>
                    {activeRun === "setup" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                    Setup
                  </Button>
                  <Button variant="secondary" onClick={() => runAction("verify")} disabled={running}>
                    {activeRun === "verify" ? <Loader2 className="size-4 animate-spin" /> : <FileCheck2 className="size-4" />}
                    Verify
                  </Button>
                  <Button variant="outline" onClick={createScore} disabled={running}>
                    {activeRun === "score" ? <Loader2 className="size-4 animate-spin" /> : <ScrollText className="size-4" />}
                    Scorecard
                  </Button>
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={forceScorecard}
                    onChange={(event) => setForceScorecard(event.target.checked)}
                    className="size-4 rounded border-input accent-primary"
                  />
                  Force overwrite
                </label>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[1fr_19rem]">
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Terminal className="size-4 text-primary" aria-hidden="true" />
                    Output
                  </CardTitle>
                  <CardDescription>
                    {result ? `${result.command} exited ${result.exitCode} in ${formatDuration(result.durationMs)}` : "No command has run yet."}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {result ? <StatusIcon ok={result.ok} /> : null}
                  <Button variant="outline" size="sm" onClick={() => copyDocument("output")} disabled={!result?.output}>
                    <Clipboard className="size-4" />
                    {copied === "output" ? "Copied" : "Copy"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="min-h-44 max-h-80 overflow-auto rounded-md border bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                  {activeRun && activeRun !== "refresh"
                    ? `Running ${activeRun}...`
                    : result?.output || "Command output will appear here."}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Scorecards</CardTitle>
                <CardDescription>{selectedBenchmark.results.length} saved for this benchmark</CardDescription>
              </CardHeader>
              <CardContent>
                {selectedBenchmark.results.length ? (
                  <div className="space-y-3">
                    {selectedBenchmark.results.slice(0, 6).map((scorecard) => (
                      <div key={scorecard.path} className="space-y-1 rounded-md border p-3">
                        <div className="break-all text-xs font-medium">{scorecard.name}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(scorecard.modifiedAt)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No scorecards yet.</div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="size-4 text-primary" aria-hidden="true" />
                  Documents
                </CardTitle>
                <CardDescription>{selectedBenchmark.dir}</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyDocument(documentTab as "task" | "rubric" | "readme")}
                disabled={!documentText}
              >
                <Clipboard className="size-4" />
                {copied === documentTab ? "Copied" : "Copy"}
              </Button>
            </CardHeader>
            <CardContent>
              <Tabs value={documentTab} onValueChange={setDocumentTab}>
                <TabsList>
                  <TabsTrigger value="task">Task</TabsTrigger>
                  <TabsTrigger value="rubric">Rubric</TabsTrigger>
                  <TabsTrigger value="readme">Readme</TabsTrigger>
                </TabsList>
                <Separator />
                <TabsContent value="task">
                  <DocumentPane text={files?.task} />
                </TabsContent>
                <TabsContent value="rubric">
                  <DocumentPane text={files?.rubric} />
                </TabsContent>
                <TabsContent value="readme">
                  <DocumentPane text={files?.readme} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-label="ready" />
  ) : (
    <XCircle className="size-5 shrink-0 text-amber-500" aria-label="not ready" />
  );
}

function DocumentPane({ text }: { text?: string }) {
  return (
    <pre className="max-h-[34rem] overflow-auto rounded-md border bg-card p-4 text-sm leading-6 whitespace-pre-wrap">
      {text ?? "Loading..."}
    </pre>
  );
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
