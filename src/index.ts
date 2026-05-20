import { loadLegionariesConfig } from './config/legionaries';
import { buildEffectiveAgentConfig } from './runtime/build-agent-config';
import { createDioLoopHooks } from './runtime/dio-loop';
import { createDomainUsageTraceHooks } from './runtime/domain-usage-contract';
import { resolveDomainPacks } from './runtime/domain-packs';

type YourLegionPluginOptions = {
  configPath?: string;
  dio?: {
    maxIterations?: number;
  };
};

type YourLegionServerInput = {
  worktree: string;
  client?: unknown;
  [key: string]: unknown;
};

const yourLegionPlugin = {
  id: 'your-legion',
  async server(input: YourLegionServerInput, options: YourLegionPluginOptions = {}) {
    const { getState: _getDioState, ...dioHooks } = createDioLoopHooks({
      client: (input as { client?: unknown }).client ?? {},
      maxIterations: options.dio?.maxIterations,
    });
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
        command?: Record<string, unknown>;
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
        config.command = {
          ...(config.command ?? {}),
          ...effectiveConfig.command,
        };
      },
      ...dioHooks,
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
  evaluateDomainUsageScenarios,
  getDomainUsageTracePath,
  parseTaskContextEnvelope,
  readDomainUsageTraceEvents,
  validateDomainUsageContract,
} from './runtime/domain-usage-contract';
export { createDomainPack } from './install';
