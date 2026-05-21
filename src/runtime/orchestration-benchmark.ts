export type BenchmarkVariant = 'native-builder' | 'your-legion-orchestrated';

export type BenchmarkSessionMetric = {
  benchmarkID: string;
  taskID: string;
  taskType: string;
  variant: BenchmarkVariant;
  agent: string;
  messages: number;
  tokensInput: number;
  tokensOutput: number;
  tokensReasoning: number;
  tokensCacheRead: number;
  tokensCacheWrite: number;
  cost: number;
  passed: boolean;
  reworkTurns: number;
  traceWarnings: number;
};

export type BenchmarkTaskComparison = {
  taskID: string;
  taskType: string;
  nativeTotalTokens: number;
  orchestratorTokens: number;
  specialistTokens: number;
  yourLegionTotalTokens: number;
  netDeltaTokens: number | null;
  netDeltaPct: number | null;
  passedNative: boolean;
  passedYourLegion: boolean;
  reworkTurnsNative: number;
  reworkTurnsYourLegion: number;
  traceWarnings: number;
};

export type BenchmarkVariantTaskTypeSummary = {
  variant: BenchmarkVariant;
  taskType: string;
  tasks: number;
  passedTasks: number;
  totalTokens: number;
  contextTokens: number;
  tokensPerPassedTask: number | null;
  averageTotalTokens: number;
  reworkTurns: number;
  traceWarnings: number;
};

export type OrchestrationBenchmarkReport = {
  tasks: BenchmarkTaskComparison[];
  byVariantAndTaskType: BenchmarkVariantTaskTypeSummary[];
};

function totalTokens(metric: BenchmarkSessionMetric) {
  return (
    metric.tokensInput +
    metric.tokensOutput +
    metric.tokensReasoning +
    metric.tokensCacheRead +
    metric.tokensCacheWrite
  );
}

function contextTokens(metric: BenchmarkSessionMetric) {
  return metric.tokensInput + metric.tokensCacheRead + metric.tokensCacheWrite;
}

function roundRatio(value: number) {
  return Math.round(value * 10000) / 10000;
}

function variantOrder(variant: BenchmarkVariant) {
  return variant === 'native-builder' ? 0 : 1;
}

function taskPassed(metrics: BenchmarkSessionMetric[]) {
  return metrics.length > 0 && metrics.every(metric => metric.passed);
}

function taskReworkTurns(metrics: BenchmarkSessionMetric[]) {
  return Math.max(0, ...metrics.map(metric => metric.reworkTurns));
}

function taskTraceWarnings(metrics: BenchmarkSessionMetric[]) {
  return metrics.reduce((total, metric) => total + metric.traceWarnings, 0);
}

function groupBy<T>(values: T[], keyFor: (value: T) => string) {
  const groups = new Map<string, T[]>();

  for (const value of values) {
    const key = keyFor(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }

  return groups;
}

export function summarizeOrchestrationBenchmark(metrics: BenchmarkSessionMetric[]): OrchestrationBenchmarkReport {
  const taskGroups = groupBy(metrics, metric => metric.taskID);
  const tasks = [...taskGroups.entries()]
    .map(([taskID, taskMetrics]) => {
      const taskType = taskMetrics[0]?.taskType ?? 'unknown';
      const nativeMetrics = taskMetrics.filter(metric => metric.variant === 'native-builder');
      const orchestratedMetrics = taskMetrics.filter(metric => metric.variant === 'your-legion-orchestrated');
      const nativeTotalTokens = nativeMetrics.reduce((total, metric) => total + totalTokens(metric), 0);
      const orchestratorTokens = orchestratedMetrics
        .filter(metric => metric.agent === 'orchestrator')
        .reduce((total, metric) => total + totalTokens(metric), 0);
      const specialistTokens = orchestratedMetrics
        .filter(metric => metric.agent !== 'orchestrator')
        .reduce((total, metric) => total + totalTokens(metric), 0);
      const yourLegionTotalTokens = orchestratorTokens + specialistTokens;
      const netDeltaTokens =
        nativeMetrics.length > 0 && orchestratedMetrics.length > 0 ? yourLegionTotalTokens - nativeTotalTokens : null;
      const netDeltaPct = netDeltaTokens === null || nativeTotalTokens === 0 ? null : roundRatio(netDeltaTokens / nativeTotalTokens);

      return {
        taskID,
        taskType,
        nativeTotalTokens,
        orchestratorTokens,
        specialistTokens,
        yourLegionTotalTokens,
        netDeltaTokens,
        netDeltaPct,
        passedNative: taskPassed(nativeMetrics),
        passedYourLegion: taskPassed(orchestratedMetrics),
        reworkTurnsNative: taskReworkTurns(nativeMetrics),
        reworkTurnsYourLegion: taskReworkTurns(orchestratedMetrics),
        traceWarnings: taskTraceWarnings(orchestratedMetrics),
      };
    })
    .sort((left, right) => left.taskID.localeCompare(right.taskID));

  const variantTaskTypeGroups = groupBy(metrics, metric => `${metric.variant}\u0000${metric.taskType}`);
  const byVariantAndTaskType = [...variantTaskTypeGroups.entries()]
    .map(([key, group]) => {
      const [variant, taskType] = key.split('\u0000') as [BenchmarkVariant, string];
      const taskGroupsForVariant = groupBy(group, metric => metric.taskID);
      const total = group.reduce((sum, metric) => sum + totalTokens(metric), 0);
      const passedTasks = [...taskGroupsForVariant.values()].filter(taskPassed).length;

      return {
        variant,
        taskType,
        tasks: taskGroupsForVariant.size,
        passedTasks,
        totalTokens: total,
        contextTokens: group.reduce((sum, metric) => sum + contextTokens(metric), 0),
        tokensPerPassedTask: passedTasks === 0 ? null : roundRatio(total / passedTasks),
        averageTotalTokens: roundRatio(total / taskGroupsForVariant.size),
        reworkTurns: [...taskGroupsForVariant.values()].reduce((sum, taskGroup) => sum + taskReworkTurns(taskGroup), 0),
        traceWarnings: group.reduce((sum, metric) => sum + metric.traceWarnings, 0),
      };
    })
    .sort(
      (left, right) =>
        variantOrder(left.variant) - variantOrder(right.variant) || left.taskType.localeCompare(right.taskType),
    );

  return {
    tasks,
    byVariantAndTaskType,
  };
}
