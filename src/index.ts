import { loadLegionariesConfig } from './config/legionaries';
import { buildEffectiveAgentConfig } from './runtime/build-agent-config';
import { createDomainUsageTraceHooks } from './runtime/domain-usage-contract';
import { resolveDomainPacks } from './runtime/domain-packs';

type YourLegionPluginOptions = {
  configPath?: string;
};

type YourLegionServerInput = {
  worktree: string;
  client?: unknown;
  [key: string]: unknown;
};

const yourLegionPlugin = {
  id: 'your-legion',
  async server(input: YourLegionServerInput, options: YourLegionPluginOptions = {}) {
    const legionariesConfig = loadLegionariesConfig({
      rootDir: input.worktree,
      configPath: options.configPath,
    });
    const domainTraceHooks = createDomainUsageTraceHooks({
      worktree: input.worktree,
      domainPacks: resolveDomainPacks({
        configPath: legionariesConfig.filePath,
        domains: legionariesConfig.domains,
      }),
    });

    return {
      async config(config: {
        default_agent?: string;
        agent?: Record<string, unknown>;
      }) {
        const effectiveConfig = await buildEffectiveAgentConfig({
          rootDir: input.worktree,
          configPath: options.configPath,
        });

        config.default_agent = effectiveConfig.default_agent;
        config.agent = {
          ...(config.agent ?? {}),
          ...effectiveConfig.agent,
        };
      },
      ...domainTraceHooks,
    };
  },
};

export default yourLegionPlugin;
export { buildEffectiveAgentConfig } from './runtime/build-agent-config';
export {
  appendDomainUsageTraceEvent,
  createDomainUsageTraceHooks,
  DOMAIN_USAGE_SCENARIOS,
  LOOP_USAGE_SCENARIOS,
  evaluateDomainUsageScenarios,
  evaluateLoopUsageScenarios,
  getDomainUsageTracePath,
  parseTaskContextEnvelope,
  readDomainUsageTraceEvents,
  validateDomainUsageContract,
} from './runtime/domain-usage-contract';
export {
  checkStaticDomainCatalog,
  diagnoseStaticDomainCatalog,
  doctorResultHash,
  runYourLegionCheck,
  runYourLegionDoctor,
} from './runtime/doctor';
export { summarizeOrchestrationBenchmark } from './runtime/orchestration-benchmark';
export type {
  BenchmarkSessionMetric,
  BenchmarkTaskComparison,
  BenchmarkVariant,
  BenchmarkVariantTaskTypeSummary,
  OrchestrationBenchmarkReport,
} from './runtime/orchestration-benchmark';
export { createDomainPack } from './install';
