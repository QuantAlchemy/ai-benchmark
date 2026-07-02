import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, LineChart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAllBenchmarkRuns, loadDashboard } from "@/lib/benchmarks.functions";
import { formatMetricDuration } from "@/lib/metrics";
import { scorecardMax, scorecardPercent, scorecardScored, scorecardTotal } from "@/lib/scorecard";
import { cn } from "@/lib/utils";
import type { BenchmarkRun } from "@/lib/benchmarks.server";

export const Route = createFileRoute("/plot")({
  loader: async () => {
    const [runs, benchmarks] = await Promise.all([loadAllBenchmarkRuns(), loadDashboard()]);
    return { runs, benchmarks };
  },
  component: ResultsPlotPage,
});

// Validated dark-mode categorical palette (fixed order — never cycled; extra
// series beyond the slots fold into a muted "other" bucket).
const SERIES_COLORS = ["#3987e5", "#199e70", "#c98500", "#008300", "#9085e9", "#e66767", "#d55181", "#d95926"];
const OTHER_COLOR = "#898781";

const VIEW_W = 860;
const VIEW_H = 520;
const PAD = { top: 44, right: 32, bottom: 56, left: 56 };

type PlotPoint = {
  run: BenchmarkRun;
  series: string;
  percent: number;
  durationMs: number;
  label: string;
};

function runSeries(run: BenchmarkRun) {
  const agent = run.agentId || "manual";
  return run.agentModel ? `${agent} · ${run.agentModel}` : agent;
}

function runDuration(run: BenchmarkRun) {
  return run.metrics?.agentDurationMs ?? run.runDurationMs ?? null;
}

function niceCeil(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

function ResultsPlotPage() {
  const { runs, benchmarks } = Route.useLoaderData();
  const [benchmarkFilter, setBenchmarkFilter] = React.useState<string>("all");
  const [hovered, setHovered] = React.useState<PlotPoint | null>(null);

  const filteredRuns = React.useMemo(
    () => runs.filter((run) => benchmarkFilter === "all" || run.benchmarkId === benchmarkFilter),
    [runs, benchmarkFilter],
  );
  const points: PlotPoint[] = React.useMemo(
    () =>
      filteredRuns.flatMap((run) => {
        const percent = scorecardScored(run.scorecardData) ? scorecardPercent(run.scorecardData) : null;
        const durationMs = runDuration(run);
        if (percent === null || durationMs === null) return [];
        return [
          {
            run,
            series: runSeries(run),
            percent,
            durationMs,
            label: [runSeries(run), run.reasoningEffort ? `(${run.reasoningEffort})` : ""].filter(Boolean).join(" "),
          },
        ];
      }),
    [filteredRuns],
  );
  const unplotted = filteredRuns.length - points.length;

  const seriesNames = React.useMemo(
    () => [...new Set(points.map((point) => point.series))].sort((a, b) => a.localeCompare(b)),
    [points],
  );
  const seriesColor = (series: string) => {
    const index = seriesNames.indexOf(series);
    return index >= 0 && index < SERIES_COLORS.length ? SERIES_COLORS[index] : OTHER_COLOR;
  };

  const maxDurationMin = niceCeil(Math.max(1, ...points.map((point) => point.durationMs / 60_000)));
  const plotW = VIEW_W - PAD.left - PAD.right;
  const plotH = VIEW_H - PAD.top - PAD.bottom;
  const xFor = (durationMs: number) => PAD.left + (durationMs / 60_000 / maxDurationMin) * plotW;
  const yFor = (percent: number) => PAD.top + (1 - percent / 100) * plotH;

  const yTicks = [0, 20, 40, 60, 80, 100];
  const xTickCount = 5;
  const xTicks = Array.from({ length: xTickCount + 1 }, (_, index) => (maxDurationMin / xTickCount) * index);

  const seriesLines = seriesNames
    .map((series) => points.filter((point) => point.series === series).sort((a, b) => a.durationMs - b.durationMs))
    .filter((seriesPoints) => seriesPoints.length >= 2);

  // Direct-label the best-scoring point of each series (CVD relief for the legend).
  const labeledPoints = seriesNames.flatMap((series) => {
    const best = points
      .filter((point) => point.series === series)
      .sort((a, b) => b.percent - a.percent)[0];
    return best ? [best] : [];
  });

  return (
    <main className="min-h-screen overflow-x-hidden bg-background">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <LineChart className="size-5 text-primary" aria-hidden="true" />
              <h1 className="text-xl font-semibold tracking-normal">Results plot</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Scorecard results from every solution across all benchmarks, plotted against agent run time.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Dashboard
            </Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-4 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={benchmarkFilter === "all" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setBenchmarkFilter("all")}
          >
            All benchmarks
          </Button>
          {benchmarks.map((benchmark) => (
            <Button
              key={benchmark.id}
              variant={benchmarkFilter === benchmark.id ? "secondary" : "outline"}
              size="sm"
              onClick={() => setBenchmarkFilter(benchmark.id)}
            >
              {benchmark.id}
            </Button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score vs. run time</CardTitle>
            <CardDescription>
              {points.length} scored run{points.length === 1 ? "" : "s"} plotted
              {unplotted > 0 ? ` · ${unplotted} run${unplotted === 1 ? "" : "s"} without a score or recorded duration appear only in the table` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {points.length ? (
              <div className="relative">
                <svg
                  role="img"
                  viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                  className="w-full"
                  aria-label="Scatter plot of scorecard percentage against agent run time in minutes"
                  onMouseLeave={() => setHovered(null)}
                >
                  {yTicks.map((tick) => (
                    <g key={`y-${tick}`}>
                      <line
                        x1={PAD.left}
                        x2={VIEW_W - PAD.right}
                        y1={yFor(tick)}
                        y2={yFor(tick)}
                        stroke="currentColor"
                        className="text-border"
                        strokeWidth={1}
                      />
                      <text
                        x={PAD.left - 8}
                        y={yFor(tick) + 4}
                        textAnchor="end"
                        fontSize={12}
                        fill="currentColor"
                        className="text-muted-foreground"
                      >
                        {tick}%
                      </text>
                    </g>
                  ))}
                  {xTicks.map((tick) => (
                    <g key={`x-${tick}`}>
                      <line
                        x1={xFor(tick * 60_000)}
                        x2={xFor(tick * 60_000)}
                        y1={PAD.top}
                        y2={VIEW_H - PAD.bottom}
                        stroke="currentColor"
                        className="text-border"
                        strokeWidth={1}
                      />
                      <text
                        x={xFor(tick * 60_000)}
                        y={VIEW_H - PAD.bottom + 20}
                        textAnchor="middle"
                        fontSize={12}
                        fill="currentColor"
                        className="text-muted-foreground"
                      >
                        {Number.isInteger(tick) ? tick : tick.toFixed(1)}
                      </text>
                    </g>
                  ))}
                  <text
                    x={PAD.left + plotW / 2}
                    y={VIEW_H - 12}
                    textAnchor="middle"
                    fontSize={13}
                    fill="currentColor"
                    className="text-muted-foreground"
                  >
                    Agent run time (minutes)
                  </text>
                  <text x={PAD.left} y={24} fontSize={13} fill="currentColor" className="text-muted-foreground">
                    Scorecard score (% of rubric max)
                  </text>

                  {seriesLines.map((seriesPoints) => (
                    <path
                      key={`line-${seriesPoints[0].series}`}
                      d={seriesPoints
                        .map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(point.durationMs).toFixed(1)} ${yFor(point.percent).toFixed(1)}`)
                        .join(" ")}
                      fill="none"
                      stroke={seriesColor(seriesPoints[0].series)}
                      strokeWidth={2}
                      opacity={0.55}
                    />
                  ))}

                  {points.map((point) => (
                    <g
                      key={point.run.id}
                      role="img"
                      aria-label={`${point.run.benchmarkId}: ${point.label}, ${point.percent.toFixed(1)}%, ${formatMetricDuration(point.durationMs)}`}
                      className="cursor-pointer"
                      onMouseEnter={() => setHovered(point)}
                      onFocus={() => setHovered(point)}
                      onBlur={() => setHovered(null)}
                      tabIndex={0}
                    >
                      <circle cx={xFor(point.durationMs)} cy={yFor(point.percent)} r={14} fill="transparent" />
                      <circle
                        cx={xFor(point.durationMs)}
                        cy={yFor(point.percent)}
                        r={hovered?.run.id === point.run.id ? 8 : 6}
                        fill={seriesColor(point.series)}
                        stroke="var(--card)"
                        strokeWidth={2}
                      />
                    </g>
                  ))}

                  {labeledPoints.map((point) => (
                    <text
                      key={`label-${point.run.id}`}
                      x={xFor(point.durationMs)}
                      y={yFor(point.percent) - 14}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight={600}
                      fill={seriesColor(point.series)}
                      stroke="var(--card)"
                      strokeWidth={4}
                      paintOrder="stroke fill"
                      pointerEvents="none"
                    >
                      {point.series}
                    </text>
                  ))}
                </svg>

                {hovered ? (
                  <div
                    className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
                    style={{
                      left: `${(xFor(hovered.durationMs) / VIEW_W) * 100}%`,
                      top: `${(yFor(hovered.percent) / VIEW_H) * 100}%`,
                      transform: "translate(-50%, calc(-100% - 12px))",
                    }}
                  >
                    <div className="font-semibold">{hovered.label}</div>
                    <div className="mt-1 text-muted-foreground">{hovered.run.benchmarkId}</div>
                    <div className="mt-1">
                      {hovered.percent.toFixed(1)}% ({scorecardTotal(hovered.run.scorecardData)}/{scorecardMax(hovered.run.scorecardData)}) ·{" "}
                      {formatMetricDuration(hovered.durationMs)}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                No plottable runs yet. A run appears here once its scorecard has at least one criterion scored and an
                agent run time was recorded.
              </div>
            )}

            {seriesNames.length ? (
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t pt-3">
                {seriesNames.map((series) => (
                  <div key={series} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      aria-hidden="true"
                      className="inline-block size-2.5 rounded-full"
                      style={{ backgroundColor: seriesColor(series) }}
                    />
                    {series}
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">All runs</CardTitle>
            <CardDescription>Every recorded run, including ones not plotted above.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-left text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Benchmark</th>
                    <th className="px-2 py-2 font-medium">Agent</th>
                    <th className="px-2 py-2 font-medium">Model</th>
                    <th className="px-2 py-2 font-medium">Reasoning</th>
                    <th className="px-2 py-2 font-medium">Score</th>
                    <th className="px-2 py-2 font-medium">%</th>
                    <th className="px-2 py-2 font-medium">Run time</th>
                    <th className="px-2 py-2 font-medium">Verify</th>
                    <th className="px-2 py-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRuns.map((run) => {
                    const scored = scorecardScored(run.scorecardData);
                    const percent = scored ? scorecardPercent(run.scorecardData) : null;
                    return (
                      <tr key={run.id} className="border-b border-border/60">
                        <td className="px-2 py-2 font-mono">{run.benchmarkId}</td>
                        <td className="px-2 py-2">{run.agentId || "manual"}</td>
                        <td className="px-2 py-2">{run.agentModel || "default"}</td>
                        <td className="px-2 py-2">{run.reasoningEffort || "—"}</td>
                        <td className="px-2 py-2">
                          {scored ? `${scorecardTotal(run.scorecardData)}/${scorecardMax(run.scorecardData)}` : "unscored"}
                        </td>
                        <td className="px-2 py-2">{percent !== null ? `${percent.toFixed(1)}%` : "—"}</td>
                        <td className="px-2 py-2">{formatMetricDuration(runDuration(run))}</td>
                        <td className="px-2 py-2">
                          {run.metrics?.verify ? (
                            <Badge variant={run.metrics.verify.ok ? "success" : "warning"}>
                              {run.metrics.verify.ok ? "pass" : "fail"}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">not run</span>
                          )}
                        </td>
                        <td className={cn("px-2 py-2 text-muted-foreground")}>{run.createdAt.slice(0, 16).replace("T", " ")}</td>
                      </tr>
                    );
                  })}
                  {!filteredRuns.length ? (
                    <tr>
                      <td colSpan={9} className="px-2 py-6 text-center text-muted-foreground">
                        No runs recorded yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
