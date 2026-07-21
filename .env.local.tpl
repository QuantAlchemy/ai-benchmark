# AI Benchmark local synchronization credentials
#
# Generate .env.local from 1Password:
#   pnpm env:generate:local
#
# This template contains references only. Never commit the generated .env.local.
# The credential is bound to one installation's default per-user data root; do
# not reuse it with another machine or an alternate AI_BENCHMARK_DATA_ROOT.

AI_BENCHMARK_SYNC_URL={{ op://code-env/ai-benchmark-local/SYNC_URL }}
AI_BENCHMARK_SYNC_CLIENT_ID={{ op://code-env/ai-benchmark-local/SYNC_CLIENT_ID }}
AI_BENCHMARK_SYNC_CLIENT_TOKEN={{ op://code-env/ai-benchmark-local/SYNC_CLIENT_TOKEN }}
