const DIO_COMPLETE_PATTERN = /<dio_complete>[\s\S]*?<\/dio_complete>/;
const DEFAULT_MAX_ITERATIONS = 100;

type OpenCodeClient = {
  session?: {
    messages?: (input: { path: { id: string } }) => Promise<unknown>;
    prompt?: (input: {
      path: { id: string };
      body: {
        parts: Array<{ type: 'text'; text: string }>;
      };
    }) => Promise<unknown>;
  };
  tui?: {
    showToast?: (input: {
      body: {
        message: string;
        variant?: 'success' | 'warning' | 'error' | 'info';
      };
    }) => Promise<unknown>;
  };
};

export type DioLoopState = {
  sessionID: string;
  objective: string;
  iteration: number;
  maxIterations: number;
};

export type CreateDioLoopHooksOptions = {
  client: OpenCodeClient;
  maxIterations?: number;
};

function textFromPart(part: unknown): string {
  if (!part || typeof part !== 'object') {
    return '';
  }

  const record = part as Record<string, unknown>;
  const value = record.text ?? record.content ?? record.value;
  return typeof value === 'string' ? value : '';
}

function textFromMessages(value: unknown): string {
  const data = value && typeof value === 'object' && 'data' in value ? (value as { data: unknown }).data : value;

  if (!Array.isArray(data)) {
    return '';
  }

  const hasRoleMetadata = data.some(message => {
    if (!message || typeof message !== 'object') {
      return false;
    }

    const info = (message as Record<string, unknown>).info;
    return Boolean(info && typeof info === 'object' && 'role' in info);
  });

  return data
    .flatMap(message => {
      if (!message || typeof message !== 'object') {
        return [];
      }

      const record = message as Record<string, unknown>;
      const info = record.info;
      const role = info && typeof info === 'object' ? (info as Record<string, unknown>).role : undefined;

      if (hasRoleMetadata && role !== 'assistant') {
        return [];
      }

      const parts = record.parts;
      return Array.isArray(parts) ? parts.map(textFromPart) : [];
    })
    .join('\n');
}

function textFromChatParts(output: unknown): string {
  if (!output || typeof output !== 'object') {
    return '';
  }

  const parts = (output as Record<string, unknown>).parts;
  return Array.isArray(parts) ? parts.map(textFromPart).join('\n') : '';
}

function extractSessionID(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const record = input as Record<string, unknown>;
  const direct = record.sessionID ?? record.sessionId;
  if (typeof direct === 'string') {
    return direct;
  }

  const properties = record.properties;
  if (properties && typeof properties === 'object') {
    const propertyRecord = properties as Record<string, unknown>;
    const propertySessionID = propertyRecord.sessionID ?? propertyRecord.sessionId;
    if (typeof propertySessionID === 'string') {
      return propertySessionID;
    }

    const session = propertyRecord.session;
    if (session && typeof session === 'object') {
      const sessionID = (session as Record<string, unknown>).id;
      if (typeof sessionID === 'string') {
        return sessionID;
      }
    }
  }

  return undefined;
}

function extractCommandName(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const record = input as Record<string, unknown>;
  const name = record.name ?? record.command;
  return typeof name === 'string' ? name.replace(/^\//, '') : undefined;
}

function extractCommandArguments(input: unknown) {
  if (!input || typeof input !== 'object') {
    return '';
  }

  const args = (input as Record<string, unknown>).arguments;
  if (typeof args === 'string') {
    return args.trim();
  }

  if (args && typeof args === 'object' && 'text' in args) {
    const text = (args as { text: unknown }).text;
    return typeof text === 'string' ? text.trim() : '';
  }

  return '';
}

function parseRawDioCommand(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/^\/(dio-stop|dio)(?:\s+([\s\S]*))?$/);

  if (!match) {
    return undefined;
  }

  return {
    command: match[1],
    arguments: (match[2] ?? '').trim(),
  };
}

function continuationPrompt(state: DioLoopState) {
  return `Continue DIO mode for this objective:

${state.objective}

You have not yet emitted the exact completion marker. Continue the work, verify the result, and only when the objective is genuinely complete include:

<dio_complete>what was completed and verified</dio_complete>`;
}

async function showToast(client: OpenCodeClient, message: string, variant: 'success' | 'warning' | 'error' | 'info') {
  await client.tui?.showToast?.({
    body: {
      message,
      variant,
    },
  });
}

export function createDioLoopHooks({ client, maxIterations = DEFAULT_MAX_ITERATIONS }: CreateDioLoopHooksOptions) {
  const sessions = new Map<string, DioLoopState>();

  function start(sessionID: string, objective: string) {
    sessions.set(sessionID, {
      sessionID,
      objective: objective || 'Continue the current task until it is complete.',
      iteration: 0,
      maxIterations,
    });
  }

  async function cancel(sessionID: string) {
    sessions.delete(sessionID);
    await showToast(client, 'DIO loop cancelled', 'warning');
  }

  async function maybeContinue(sessionID: string) {
    const state = sessions.get(sessionID);
    if (!state) {
      return;
    }

    const messages = await client.session?.messages?.({ path: { id: sessionID } });
    if (DIO_COMPLETE_PATTERN.test(textFromMessages(messages))) {
      sessions.delete(sessionID);
      await showToast(client, 'DIO loop complete', 'success');
      return;
    }

    if (state.iteration >= state.maxIterations) {
      sessions.delete(sessionID);
      await showToast(client, 'DIO loop stopped at iteration limit', 'warning');
      return;
    }

    state.iteration += 1;
    await client.session?.prompt?.({
      path: { id: sessionID },
      body: {
        parts: [
          {
            type: 'text',
            text: continuationPrompt(state),
          },
        ],
      },
    });
  }

  return {
    getState(sessionID: string) {
      return sessions.get(sessionID);
    },
    async 'command.executed'(input: unknown) {
      const command = extractCommandName(input);
      const sessionID = extractSessionID(input);
      if (!command || !sessionID) {
        return;
      }

      if (command === 'dio') {
        start(sessionID, extractCommandArguments(input));
      }

      if (command === 'dio-stop') {
        await cancel(sessionID);
      }
    },
    async 'chat.message'(input: unknown, output: unknown) {
      const sessionID = extractSessionID(input);
      if (!sessionID) {
        return;
      }

      const command = parseRawDioCommand(textFromChatParts(output));
      if (!command) {
        return;
      }

      if (command.command === 'dio') {
        start(sessionID, command.arguments);
      }

      if (command.command === 'dio-stop') {
        await cancel(sessionID);
      }
    },
    async event({ event }: { event: unknown }) {
      if (!event || typeof event !== 'object') {
        return;
      }

      if ((event as Record<string, unknown>).type !== 'session.idle') {
        return;
      }

      const sessionID = extractSessionID(event);
      if (sessionID) {
        await maybeContinue(sessionID);
      }
    },
  };
}
