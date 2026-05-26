import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeOrchestrationBenchmark, type BenchmarkSessionMetric } from '../src/runtime/orchestration-benchmark';

const baseMetric = {
  benchmarkID: 'yl-orchestrator-vs-native-001',
  taskType: 'coding',
  messages: 1,
  cost: 0,
  traceWarnings: 0,
  reworkTurns: 0,
  passed: true,
};

function metric(overrides: Partial<BenchmarkSessionMetric>): BenchmarkSessionMetric {
  return {
    ...baseMetric,
    taskID: 'coding-001',
    variant: 'native-builder',
    agent: 'builder',
    tokensInput: 0,
    tokensOutput: 0,
    tokensReasoning: 0,
    tokensCacheRead: 0,
    tokensCacheWrite: 0,
    ...overrides,
  };
}

test('summarizes native builder against full orchestrated delegation cost', () => {
  const report = summarizeOrchestrationBenchmark([
    metric({
      taskID: 'coding-001',
      variant: 'native-builder',
      agent: 'builder',
      tokensInput: 100,
      tokensOutput: 20,
      tokensReasoning: 10,
      tokensCacheRead: 5,
    }),
    metric({
      taskID: 'coding-001',
      variant: 'your-legion-orchestrated',
      agent: 'orchestrator',
      tokensInput: 30,
      tokensOutput: 10,
    }),
    metric({
      taskID: 'coding-001',
      variant: 'your-legion-orchestrated',
      agent: 'builder',
      tokensInput: 60,
      tokensOutput: 15,
      tokensReasoning: 5,
    }),
  ]);

  assert.equal(report.tasks.length, 1);
  assert.deepEqual(report.tasks[0], {
    taskID: 'coding-001',
    taskType: 'coding',
    nativeTotalTokens: 135,
    orchestratorTokens: 40,
    specialistTokens: 80,
    yourLegionTotalTokens: 120,
    netDeltaTokens: -15,
    netDeltaPct: -0.1111,
    outcome: 'cheaper-same-quality',
    passedNative: true,
    passedYourLegion: true,
    reworkTurnsNative: 0,
    reworkTurnsYourLegion: 0,
    traceWarnings: 0,
  });
});

test('classifies quality plus token tradeoffs per paired task', () => {
  const report = summarizeOrchestrationBenchmark([
    metric({
      taskID: 'marketing-001',
      taskType: 'marketing',
      variant: 'native-builder',
      tokensInput: 100,
      passed: false,
    }),
    metric({
      taskID: 'marketing-001',
      taskType: 'marketing',
      variant: 'your-legion-orchestrated',
      agent: 'orchestrator',
      tokensInput: 40,
    }),
    metric({
      taskID: 'marketing-001',
      taskType: 'marketing',
      variant: 'your-legion-orchestrated',
      agent: 'builder',
      tokensInput: 90,
    }),
    metric({
      taskID: 'finance-001',
      taskType: 'finance',
      variant: 'native-builder',
      tokensInput: 100,
    }),
    metric({
      taskID: 'finance-001',
      taskType: 'finance',
      variant: 'your-legion-orchestrated',
      agent: 'orchestrator',
      tokensInput: 40,
    }),
    metric({
      taskID: 'finance-001',
      taskType: 'finance',
      variant: 'your-legion-orchestrated',
      agent: 'builder',
      tokensInput: 90,
    }),
  ]);

  assert.deepEqual(
    report.tasks.map(task => ({
      taskID: task.taskID,
      netDeltaTokens: task.netDeltaTokens,
      passedNative: task.passedNative,
      passedYourLegion: task.passedYourLegion,
      outcome: task.outcome,
    })),
    [
      {
        taskID: 'finance-001',
        netDeltaTokens: 30,
        passedNative: true,
        passedYourLegion: true,
        outcome: 'more-expensive-not-better',
      },
      {
        taskID: 'marketing-001',
        netDeltaTokens: 30,
        passedNative: false,
        passedYourLegion: true,
        outcome: 'more-expensive-better',
      },
    ],
  );
  assert.deepEqual(report.byOutcome, [
    {
      outcome: 'more-expensive-better',
      tasks: 1,
    },
    {
      outcome: 'more-expensive-not-better',
      tasks: 1,
    },
  ]);
});

test('aggregates tokens per passed task by variant and task type', () => {
  const report = summarizeOrchestrationBenchmark([
    metric({
      taskID: 'coding-001',
      variant: 'native-builder',
      tokensInput: 100,
      tokensOutput: 20,
    }),
    metric({
      taskID: 'coding-001',
      variant: 'your-legion-orchestrated',
      agent: 'orchestrator',
      tokensInput: 20,
    }),
    metric({
      taskID: 'coding-001',
      variant: 'your-legion-orchestrated',
      agent: 'builder',
      tokensInput: 70,
      tokensOutput: 10,
    }),
    metric({
      taskID: 'debug-001',
      taskType: 'debug',
      variant: 'native-builder',
      tokensInput: 50,
      tokensOutput: 10,
      passed: false,
      reworkTurns: 1,
    }),
    metric({
      taskID: 'debug-001',
      taskType: 'debug',
      variant: 'your-legion-orchestrated',
      agent: 'orchestrator',
      tokensInput: 15,
    }),
    metric({
      taskID: 'debug-001',
      taskType: 'debug',
      variant: 'your-legion-orchestrated',
      agent: 'builder',
      tokensInput: 35,
      tokensOutput: 5,
    }),
  ]);

  assert.deepEqual(report.byVariantAndTaskType, [
    {
      variant: 'native-builder',
      taskType: 'coding',
      tasks: 1,
      passedTasks: 1,
      totalTokens: 120,
      contextTokens: 100,
      tokensPerPassedTask: 120,
      averageTotalTokens: 120,
      reworkTurns: 0,
      traceWarnings: 0,
    },
    {
      variant: 'native-builder',
      taskType: 'debug',
      tasks: 1,
      passedTasks: 0,
      totalTokens: 60,
      contextTokens: 50,
      tokensPerPassedTask: null,
      averageTotalTokens: 60,
      reworkTurns: 1,
      traceWarnings: 0,
    },
    {
      variant: 'your-legion-orchestrated',
      taskType: 'coding',
      tasks: 1,
      passedTasks: 1,
      totalTokens: 100,
      contextTokens: 90,
      tokensPerPassedTask: 100,
      averageTotalTokens: 100,
      reworkTurns: 0,
      traceWarnings: 0,
    },
    {
      variant: 'your-legion-orchestrated',
      taskType: 'debug',
      tasks: 1,
      passedTasks: 1,
      totalTokens: 55,
      contextTokens: 50,
      tokensPerPassedTask: 55,
      averageTotalTokens: 55,
      reworkTurns: 0,
      traceWarnings: 0,
    },
  ]);
});
