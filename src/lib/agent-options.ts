export type AgentModelOption = {
  value: string;
  label: string;
  description?: string;
  supportsServiceTier?: boolean;
  supportsFastMode?: boolean;
  isExactModel?: boolean;
  resolvedModel?: string;
  reasoningEfforts?: AgentReasoningOption[];
  defaultReasoningEffort?: string;
};

export type AgentReasoningOption = {
  value: string;
  label: string;
};

export const AGENT_MODEL_OPTIONS: Record<string, AgentModelOption[]> = {
  codex: [
    { value: "", label: "CLI default", description: "Use the local Codex default." },
    {
      value: "gpt-5.6-sol",
      label: "GPT-5.6-Sol",
      description: "Latest frontier agentic coding model.",
      supportsServiceTier: true,
      supportsFastMode: true,
    },
    {
      value: "gpt-5.6-terra",
      label: "GPT-5.6-Terra",
      description: "Balanced agentic coding model for everyday work.",
      supportsServiceTier: true,
      supportsFastMode: true,
    },
    {
      value: "gpt-5.6-luna",
      label: "GPT-5.6-Luna",
      description: "Fast and affordable agentic coding model.",
      supportsServiceTier: true,
      supportsFastMode: true,
    },
    {
      value: "gpt-5.5",
      label: "GPT-5.5",
      description: "Frontier Codex model for complex benchmark work.",
      supportsServiceTier: true,
      supportsFastMode: true,
    },
    {
      value: "gpt-5.4",
      label: "GPT-5.4",
      description: "Strong general Codex model.",
      supportsServiceTier: true,
      supportsFastMode: true,
    },
    { value: "gpt-5.4-mini", label: "GPT-5.4-Mini", description: "Faster, lighter Codex model." },
    {
      value: "gpt-5.3-codex-spark",
      label: "GPT-5.3-Codex-Spark",
      description: "Codex-tuned Spark model.",
    },
    { value: "gpt-5.3-codex", label: "GPT-5.3-Codex", description: "Codex-tuned GPT-5.3 model." },
    { value: "gpt-5.2", label: "GPT-5.2", description: "Previous GPT-5 generation." },
  ],
  claude: [
    { value: "", label: "CLI default", description: "Use the local Claude Code default." },
    { value: "fable", label: "Fable", description: "Claude Code Fable alias." },
    { value: "claude-fable-5", label: "Claude Fable 5", description: "Current Fable model ID." },
    { value: "opus", label: "Opus", description: "Claude Code Opus alias." },
    { value: "claude-opus-4-8", label: "Claude Opus 4.8", description: "Current Opus model ID." },
    { value: "sonnet", label: "Sonnet", description: "Claude Code Sonnet alias." },
    { value: "claude-sonnet-5", label: "Claude Sonnet 5", description: "Current Sonnet model ID." },
    { value: "haiku", label: "Haiku", description: "Claude Code Haiku alias." },
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5", description: "Current Haiku model ID." },
  ],
  cursor: [
    { value: "", label: "CLI default", description: "Use the local Cursor Agent default." },
    { value: "gpt-5.4", label: "GPT-5.4", description: "Cursor ACP model id.", supportsFastMode: true },
    {
      value: "gpt-5.4-medium-fast",
      label: "GPT-5.4 Medium Fast",
      description: "Cursor parameterized model id.",
      supportsFastMode: true,
    },
    { value: "claude-opus-4-6", label: "Claude Opus 4.6", description: "Cursor ACP model id.", supportsFastMode: true },
    { value: "composer-2", label: "Composer 2", description: "Cursor composer model." },
    { value: "default", label: "Cursor default", description: "Cursor ACP default model id." },
  ],
};

const BASE_REASONING_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium (default)" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
] as const;

const CLAUDE_REASONING_OPTIONS = [
  ...BASE_REASONING_OPTIONS,
  { value: "max", label: "Max" },
] as const;

export const FAST_MODE_OPTIONS = [
  { value: "standard", label: "Standard (default)" },
  { value: "fast", label: "Fast" },
] as const;

export const CODEX_SERVICE_TIER_OPTIONS = [
  { value: "default", label: "Standard (default)" },
  { value: "priority", label: "Fast" },
] as const;

export function getAgentModelOptions(agentId: string): AgentModelOption[] {
  return AGENT_MODEL_OPTIONS[agentId] ?? [{ value: "", label: "CLI default" }];
}

export function getAgentReasoningOptions(
  agentId: string,
  model?: AgentModelOption,
): readonly AgentReasoningOption[] {
  if (model?.reasoningEfforts?.length) return model.reasoningEfforts;
  if (agentId === "claude") return CLAUDE_REASONING_OPTIONS;
  if (agentId === "codex" || agentId === "cursor") return BASE_REASONING_OPTIONS;
  return [];
}

export function supportsAgentReasoning(agentId: string): boolean {
  return getAgentReasoningOptions(agentId).length > 0;
}

export function supportsAgentFastMode(agentId: string, model?: AgentModelOption): boolean {
  if (agentId === "codex") return model?.value === "" || Boolean(model?.supportsServiceTier);
  if (agentId === "cursor") return model?.value === "" || Boolean(model?.supportsFastMode);
  return false;
}
