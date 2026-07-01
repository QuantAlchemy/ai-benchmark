import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bot,
  CheckCircle2,
  Clipboard,
  Database,
  FileCheck2,
  FileText,
  History,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Terminal,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  CODEX_SERVICE_TIER_OPTIONS,
  FAST_MODE_OPTIONS,
  getAgentReasoningOptions,
  getAgentModelOptions,
  supportsAgentFastMode,
  supportsAgentReasoning,
} from "@/lib/agent-options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteBenchmarkRunAction,
  loadBenchmarkAgents,
  loadBenchmarkFiles,
  loadBenchmarkRuns,
  loadDashboard,
  runBenchmarkAgentAction,
  runBenchmarkAction,
  saveBenchmarkRunAction,
} from "@/lib/benchmarks.functions";
import {
  renderScorecardMarkdown,
  scorecardMax,
  scorecardTotal,
  type ScorecardData,
} from "@/lib/scorecard";
import { cn } from "@/lib/utils";
import type { BenchmarkAgent, BenchmarkRun, CommandResult, DashboardBenchmark } from "@/lib/benchmarks.server";

type BenchmarkFiles = Awaited<ReturnType<typeof loadBenchmarkFiles>>;
type ActiveRun = "setup" | "verify" | "agent" | "refresh" | null;
const DEFAULT_SCORECARD_MODEL = "rubric-v1";

export const Route = createFileRoute("/")({
  loader: async () => {
    const benchmarks = await loadDashboard();
    const agents = await loadBenchmarkAgents();
    const initialFiles = benchmarks[0] ? await loadBenchmarkFiles({ data: { id: benchmarks[0].id } }) : null;
    const initialRuns = benchmarks[0] ? await loadBenchmarkRuns({ data: { id: benchmarks[0].id } }) : [];
    return { benchmarks, agents, initialFiles, initialRuns };
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
  const [agentId, setAgentId] = React.useState(loadedAgents.find((agent) => agent.available)?.id ?? loadedAgents[0]?.id ?? "codex");
  const [agentModel, setAgentModel] = React.useState("");
  const [reasoningEffort, setReasoningEffort] = React.useState("high");
  const [fastMode, setFastMode] = React.useState("standard");
  const [files, setFiles] = React.useState<BenchmarkFiles | null>(loaded.initialFiles);
  const [runHistory, setRunHistory] = React.useState<BenchmarkRun[]>(loaded.initialRuns);
  const [selectedRunId, setSelectedRunId] = React.useState<number | null>(loaded.initialRuns[0]?.id ?? null);
  const [scorecardData, setScorecardData] = React.useState<ScorecardData | null>(loaded.initialRuns[0]?.scorecardData ?? null);
  const [runNotes, setRunNotes] = React.useState(loaded.initialRuns[0]?.notes ?? "");
  const [savingScorecard, setSavingScorecard] = React.useState(false);
  const [deletingScorecard, setDeletingScorecard] = React.useState(false);
  const [activeRun, setActiveRun] = React.useState<ActiveRun>(null);
  const [result, setResult] = React.useState<CommandResult | null>(null);
  const [documentTab, setDocumentTab] = React.useState("task");
  const [historyTab, setHistoryTab] = React.useState("scorecard");
  const [copied, setCopied] = React.useState<string | null>(null);

  React.useEffect(() => setBenchmarks(loadedBenchmarks), [loadedBenchmarks]);
  React.useEffect(() => setAgents(loadedAgents), [loadedAgents]);

  React.useEffect(() => {
    if (!selectedBenchmark) return;
    if (files?.benchmark.id !== selectedBenchmark.id) setFiles(null);
    setResult(null);
    setCopied(null);
    let cancelled = false;

    Promise.all([
      loadBenchmarkFiles({ data: { id: selectedBenchmark.id } }),
      loadBenchmarkRuns({ data: { id: selectedBenchmark.id } }),
    ]).then(([nextFiles, nextRuns]) => {
      if (!cancelled) setFiles(nextFiles);
      if (!cancelled) {
        setRunHistory(nextRuns);
        setSelectedRunId(nextRuns[0]?.id ?? null);
        setScorecardData(nextRuns[0]?.scorecardData ?? null);
        setRunNotes(nextRuns[0]?.notes ?? "");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedBenchmark?.id]);

  React.useEffect(() => {
    const options = getAgentModelOptions(agentId);
    if (!options.some((option) => option.value === agentModel)) setAgentModel("");
    setReasoningEffort((current) => current || "high");
    setFastMode("standard");
  }, [agentId]);

  React.useEffect(() => {
    const selectedRun = runHistory.find((run) => run.id === selectedRunId) ?? runHistory[0] ?? null;
    if (!selectedRun) {
      setSelectedRunId(null);
      setScorecardData(null);
      setRunNotes("");
      return;
    }
    if (selectedRun.id !== selectedRunId) setSelectedRunId(selectedRun.id);
    setScorecardData(selectedRun.scorecardData);
    setRunNotes(selectedRun.notes);
  }, [selectedRunId, runHistory]);

  async function refreshDashboard() {
    setActiveRun("refresh");
    const [nextBenchmarks, nextAgents] = await Promise.all([loadDashboard(), loadBenchmarkAgents()]);
    setBenchmarks(nextBenchmarks);
    setAgents(nextAgents);
    setActiveRun(null);
  }

  async function refreshRunHistory() {
    if (!selectedBenchmark) return;
    const nextRuns = await loadBenchmarkRuns({ data: { id: selectedBenchmark.id } });
    setRunHistory(nextRuns);
  }

  async function runAction(action: "setup" | "verify") {
    if (!selectedBenchmark) return;
    setActiveRun(action);
    setResult(null);
    const selectedRun = runHistory.find((run) => run.id === selectedRunId) ?? runHistory[0] ?? null;
    const nextResult = await runBenchmarkAction({
      data: {
        id: selectedBenchmark.id,
        action,
        solution: action === "verify" ? selectedRun?.solutionPath : undefined,
      },
    });
    setResult(nextResult);
    if (nextResult.run) {
      setSelectedRunId(nextResult.run.id);
      setScorecardData(nextResult.run.scorecardData);
      setRunNotes(nextResult.run.notes);
      await refreshRunHistory();
    }
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
        reasoningEffort: reasoningEnabled ? reasoningEffort : "",
        serviceTier: serviceTierValue,
        fastMode: fastModeEnabled && fastMode === "fast",
      },
    });
    setResult(nextResult);
    if (nextResult.run) {
      setSelectedRunId(nextResult.run.id);
      setScorecardData(nextResult.run.scorecardData);
      setRunNotes(nextResult.run.notes);
      await refreshRunHistory();
    }
    await refreshDashboard();
  }

  async function saveScorecard() {
    if (!selectedRunId || !scorecardData) return;
    setSavingScorecard(true);
    try {
      const updatedRun = await saveBenchmarkRunAction({
        data: {
          id: selectedRunId,
          scoreModel: selectedRun?.scoreModel || DEFAULT_SCORECARD_MODEL,
          scorecardData,
          notes: runNotes,
        },
      });
      setRunHistory((runs) => runs.map((run) => (run.id === updatedRun.id ? updatedRun : run)));
      setScorecardData(updatedRun.scorecardData);
      setRunNotes(updatedRun.notes);
    } finally {
      setSavingScorecard(false);
    }
  }

  async function deleteScorecard() {
    if (!selectedRunId) return;
    setDeletingScorecard(true);
    const deletedRun = await deleteBenchmarkRunAction({ data: { id: selectedRunId } });
    const nextRuns = runHistory.filter((run) => run.id !== deletedRun.id);
    setRunHistory(nextRuns);
    setSelectedRunId(nextRuns[0]?.id ?? null);
    setDeletingScorecard(false);
  }

  async function copyDocument(key: "task" | "rubric" | "readme" | "output" | "scorecard") {
    const currentRun = runHistory.find((run) => run.id === selectedRunId) ?? runHistory[0] ?? null;
    const text =
      key === "output"
        ? (result?.output ?? "")
        : key === "scorecard"
          ? currentRun && scorecardData
            ? renderScorecardMarkdown({
                benchmarkName: currentRun.benchmarkName,
                benchmarkId: currentRun.benchmarkId,
                scoreModel: currentRun.scoreModel || DEFAULT_SCORECARD_MODEL,
                createdAt: currentRun.createdAt,
                data: scorecardData,
                notes: runNotes,
              })
            : ""
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

  function updateCriterion(
    id: string,
    patch: Partial<Pick<ScorecardData["criteria"][number], "score" | "notes">>,
  ) {
    setScorecardData((current) =>
      current
        ? {
            ...current,
            criteria: current.criteria.map((criterion) =>
              criterion.id === id ? { ...criterion, ...patch } : criterion,
            ),
          }
        : current,
    );
  }

  function updateCheck(id: string, checked: boolean) {
    setScorecardData((current) =>
      current
        ? {
            ...current,
            checks: current.checks.map((check) => (check.id === id ? { ...check, checked } : check)),
          }
        : current,
    );
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
  const agentModelOptions = getAgentModelOptions(agentId);
  const selectedModelOption = agentModelOptions.find((option) => option.value === agentModel) ?? agentModelOptions[0];
  const reasoningOptions = getAgentReasoningOptions(agentId);
  const reasoningEnabled = supportsAgentReasoning(agentId);
  const fastModeEnabled = supportsAgentFastMode(agentId, selectedModelOption);
  const serviceTierValue =
    fastModeEnabled && fastMode === "fast" ? (agentId === "codex" ? "priority" : "fast") : "";
  const selectedRun = runHistory.find((run) => run.id === selectedRunId) ?? runHistory[0] ?? null;
  const activeScorecardData = scorecardData ?? selectedRun?.scorecardData ?? null;
  const totalScore = activeScorecardData ? scorecardTotal(activeScorecardData) : 0;
  const maxScore = activeScorecardData ? scorecardMax(activeScorecardData) : 0;
  const scorecardIsDirty = Boolean(
    selectedRun &&
      activeScorecardData &&
      (runNotes !== selectedRun.notes ||
        JSON.stringify(activeScorecardData) !== JSON.stringify(selectedRun.scorecardData)),
  );
  const documentText =
    documentTab === "task" ? files?.task : documentTab === "rubric" ? files?.rubric : files?.readme;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,oklch(0.96_0.04_178),transparent_34rem)]">
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

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-3">
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

        <section className="min-w-0 space-y-4">
          <Card className="min-w-0">
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
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Agent runs are stored under <span className="font-mono">{selectedBenchmark.defaultSolution}/</span> with
                timestamp, model, reasoning, and fast-mode details in the folder name.
              </div>

              <div className="grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]">
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
                  <select
                    id="agent-model-name"
                    value={agentModel}
                    onChange={(event) => setAgentModel(event.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={running}
                  >
                    {agentModelOptions.map((option, index) => (
                      <option key={`${option.value || "cli-default"}-${index}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {selectedModelOption?.description ? (
                    <p className="text-xs text-muted-foreground">{selectedModelOption.description}</p>
                  ) : null}
                </div>
              </div>
              {reasoningEnabled || fastModeEnabled ? (
                <div className="grid gap-3 lg:grid-cols-[16rem_16rem_1fr]">
                  {reasoningEnabled ? (
                    <div className="space-y-2">
                      <Label htmlFor="agent-reasoning-effort">Reasoning</Label>
                      <select
                        id="agent-reasoning-effort"
                        value={reasoningEffort}
                        onChange={(event) => setReasoningEffort(event.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={running}
                      >
                        {reasoningOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {fastModeEnabled ? (
                    <div className="space-y-2">
                      <Label htmlFor="agent-fast-mode">Fast mode</Label>
                      <select
                        id="agent-fast-mode"
                        value={fastMode}
                        onChange={(event) => setFastMode(event.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={running}
                      >
                        {FAST_MODE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <div className="flex items-end text-xs text-muted-foreground">
                    {agentId === "claude"
                      ? "Claude runs pass reasoning as --effort."
                      : agentId === "cursor"
                        ? "Cursor runs encode reasoning and fast mode as model parameters."
                        : "Codex runs pass these as CLI config overrides."}
                  </div>
                </div>
              ) : null}
              {selectedAgent ? (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {selectedAgent.version || selectedAgent.status}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button onClick={runAgent} disabled={running || !selectedAgent?.available}>
                  {activeRun === "agent" ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}
                  Run agent
                </Button>
                <Button onClick={() => runAction("setup")} disabled={running}>
                  {activeRun === "setup" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                  Setup
                </Button>
                <Button variant="secondary" onClick={() => runAction("verify")} disabled={running || !selectedRun}>
                  {activeRun === "verify" ? <Loader2 className="size-4 animate-spin" /> : <FileCheck2 className="size-4" />}
                  Verify
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
            <Card className="min-w-0">
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
                <pre className="min-h-44 max-h-80 max-w-full overflow-auto rounded-md border bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                  {activeRun && activeRun !== "refresh"
                    ? `Running ${activeRun}...`
                    : result?.output || "Command output will appear here."}
                </pre>
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="size-4 text-primary" aria-hidden="true" />
                  Scorecards
                </CardTitle>
                <CardDescription>{runHistory.length} saved for this benchmark</CardDescription>
              </CardHeader>
              <CardContent>
                {runHistory.length ? (
                  <div className="space-y-3">
                    {runHistory.slice(0, 6).map((run) => (
                      <button
                        key={run.id}
                        type="button"
                        onClick={() => setSelectedRunId(run.id)}
                        className={cn(
                          "w-full rounded-md border p-3 text-left transition-colors hover:border-primary/40",
                          selectedRun?.id === run.id && "border-primary ring-2 ring-ring/25",
                        )}
                      >
                        <div className="break-all text-xs font-medium">Run #{run.id}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{formatDate(run.createdAt)}</div>
                        {run.notes ? <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">{run.notes}</div> : null}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    Successful agent runs create scorecards automatically.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="min-w-0">
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="size-4 text-primary" aria-hidden="true" />
                  Scorecard
                </CardTitle>
                <CardDescription>
                  {selectedRun
                    ? `Run #${selectedRun.id} from ${formatDate(selectedRun.createdAt)}`
                    : "Successful agent runs create scorecards automatically."}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => copyDocument("scorecard")} disabled={!selectedRun || !activeScorecardData}>
                  <Clipboard className="size-4" />
                  {copied === "scorecard" ? "Copied" : "Copy"}
                </Button>
                <Button variant="outline" size="sm" onClick={saveScorecard} disabled={!selectedRun || savingScorecard || !scorecardIsDirty}>
                  {savingScorecard ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Save
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (window.confirm("Delete this scorecard and its generated markdown file?")) void deleteScorecard();
                  }}
                  disabled={!selectedRun || deletingScorecard}
                >
                  {deletingScorecard ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  Delete
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {selectedRun && activeScorecardData ? (
                <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
                  <div className="min-w-0 space-y-3 rounded-md border bg-muted/30 p-3 text-xs">
                    <ResultMeta label="Benchmark" value={selectedRun.benchmarkId} />
                    <ResultMeta label="Agent" value={selectedRun.agentId || "not recorded"} />
                    <ResultMeta label="Agent model" value={selectedRun.agentModel || "CLI default"} />
                    {selectedRun.reasoningEffort ? <ResultMeta label="Reasoning" value={formatReasoning(selectedRun.reasoningEffort)} /> : null}
                    {selectedRun.serviceTier ? <ResultMeta label="Service tier" value={formatServiceTier(selectedRun.serviceTier)} /> : null}
                    <ResultMeta label="Solution" value={selectedRun.solutionPath} />
                    {selectedRun.scorecardPath ? <ResultMeta label="Scorecard" value={selectedRun.scorecardPath} /> : null}
                    <div className="rounded-md border bg-background p-3">
                      <div className="text-xs font-medium text-muted-foreground">Total</div>
                      <div className="mt-1 text-lg font-semibold">{totalScore}/{maxScore}</div>
                    </div>
                  </div>
                  <Tabs value={historyTab} onValueChange={setHistoryTab} className="min-w-0">
                    <TabsList>
                      <TabsTrigger value="scorecard">Scorecard</TabsTrigger>
                      <TabsTrigger value="notes">Notes</TabsTrigger>
                    </TabsList>
                    <TabsContent value="scorecard">
                      <ScorecardForm
                        data={activeScorecardData}
                        total={totalScore}
                        max={maxScore}
                        onCriterionScore={(id, score) => updateCriterion(id, { score })}
                        onCriterionNotes={(id, notes) => updateCriterion(id, { notes })}
                        onCheck={updateCheck}
                      />
                    </TabsContent>
                    <TabsContent value="notes">
                      <Textarea
                        value={runNotes}
                        onChange={(event) => setRunNotes(event.target.value)}
                        className="min-h-64 font-mono text-xs leading-5"
                        placeholder="Record scoring notes, issues found during testing, and follow-up observations."
                      />
                    </TabsContent>
                  </Tabs>
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Scorecards will appear here after a successful agent run.
                </div>
              )}
            </CardContent>
          </Card>

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

function ScorecardForm({
  data,
  total,
  max,
  onCriterionScore,
  onCriterionNotes,
  onCheck,
}: {
  data: ScorecardData;
  total: number;
  max: number;
  onCriterionScore: (id: string, score: number | null) => void;
  onCriterionNotes: (id: string, notes: string) => void;
  onCheck: (id: string, checked: boolean) => void;
}) {
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{data.title}</div>
          {data.scale ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{data.scale}</p> : null}
        </div>
        <Badge variant="secondary" className="w-fit shrink-0">
          {total}/{max}
        </Badge>
      </div>

      <div className="space-y-3">
        {data.criteria.map((criterion) => {
          const weighted = criterion.score === null ? "" : criterion.score * criterion.weight;
          return (
            <div key={criterion.id} className="min-w-0 rounded-md border bg-card p-3">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_6rem_7rem_7rem]">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {criterion.index}. {criterion.name}
                  </div>
                  {criterion.description ? (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{criterion.description}</p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Weight</Label>
                  <div className="h-9 rounded-md border bg-muted/40 px-3 py-2 text-sm">x{criterion.weight}</div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`criterion-score-${criterion.id}`} className="text-xs text-muted-foreground">
                    Score
                  </Label>
                  <select
                    id={`criterion-score-${criterion.id}`}
                    value={criterion.score ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      onCriterionScore(criterion.id, value === "" ? null : Number(value));
                    }}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <option value="">-</option>
                    {[0, 1, 2, 3, 4, 5].map((score) => (
                      <option key={score} value={score}>
                        {score}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Weighted</Label>
                  <div className="h-9 rounded-md border bg-muted/40 px-3 py-2 text-sm">{weighted}</div>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                <Label htmlFor={`criterion-notes-${criterion.id}`} className="text-xs text-muted-foreground">
                  Notes
                </Label>
                <Textarea
                  id={`criterion-notes-${criterion.id}`}
                  value={criterion.notes}
                  onChange={(event) => onCriterionNotes(criterion.id, event.target.value)}
                  className="min-h-20 text-sm leading-5"
                />
              </div>
            </div>
          );
        })}
      </div>

      {data.checks.length ? (
        <div className="rounded-md border bg-card p-3">
          <div className="text-sm font-semibold">Checks</div>
          <div className="mt-3 space-y-2">
            {data.checks.map((check) => (
              <label key={check.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={check.checked}
                  onChange={(event) => onCheck(check.id, event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
                />
                <span className="leading-5">{check.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DocumentPane({ text }: { text?: string }) {
  return (
    <pre className="max-h-[34rem] max-w-full overflow-auto rounded-md border bg-card p-4 text-sm leading-6 whitespace-pre-wrap">
      {text ?? "Loading..."}
    </pre>
  );
}

function ResultMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="font-medium text-muted-foreground">{label}</div>
      <div className="break-all text-foreground">{value}</div>
    </div>
  );
}

function formatReasoning(value: string) {
  const labels: Record<string, string> = {
    low: "Low",
    medium: "Medium",
    high: "High",
    xhigh: "Extra High",
    max: "Max",
  };
  return labels[value] ?? value;
}

function formatServiceTier(value: string) {
  if (value === "fast") return "Fast";
  return CODEX_SERVICE_TIER_OPTIONS.find((option) => option.value === value)?.label ?? value;
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
