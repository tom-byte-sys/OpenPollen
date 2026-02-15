import { getLogger } from '../utils/logger.js';
import type { Session } from '../gateway/session.js';
import type { AppConfig } from '../config/schema.js';
import { createPermissionHandler, parseAllowedTools } from './permissions.js';
import { SkillManager } from './skill-manager.js';

const log = getLogger('agent-runner');

export interface AgentRunnerOptions {
  config: AppConfig;
  skillManager: SkillManager;
}

export class AgentRunner {
  private config: AppConfig;
  private skillManager: SkillManager;

  constructor(options: AgentRunnerOptions) {
    this.config = options.config;
    this.skillManager = options.skillManager;
  }

  /**
   * 运行 Agent 处理用户消息
   */
  async run(session: Session, userMessage: string): Promise<string> {
    log.info({
      sessionId: session.id,
      messageLength: userMessage.length,
    }, '开始处理消息');

    try {
      // 尝试加载 Claude Agent SDK
      const sdk = await this.loadSDK();

      if (sdk) {
        return await this.runWithSDK(sdk, session, userMessage);
      }

      // SDK 不可用时使用直接 API 调用
      return await this.runWithAPI(session, userMessage);
    } catch (error) {
      log.error({ sessionId: session.id, error }, 'Agent 执行失败');
      throw error;
    }
  }

  private async loadSDK(): Promise<ClaudeSDK | null> {
    try {
      const mod = await import('@anthropic-ai/claude-code');
      return mod as ClaudeSDK;
    } catch {
      log.debug('Claude Agent SDK 未安装，使用直接 API 模式');
      return null;
    }
  }

  private async runWithSDK(sdk: ClaudeSDK, session: Session, userMessage: string): Promise<string> {
    const { config, skillManager } = this;
    const skillsDir = skillManager['skillsDir'];

    // 收集技能的额外权限
    const skills = skillManager.list();
    const additionalRules = skills.flatMap(s =>
      s.allowedTools ? parseAllowedTools(s.allowedTools) : [],
    );
    const permissionHandler = createPermissionHandler(session, additionalRules);

    const options: Record<string, unknown> = {
      allowedTools: ['Skill', ...config.agent.defaultTools],
      model: session.model ?? config.agent.model,
      maxTurns: config.agent.maxTurns,
      maxBudgetUsd: config.agent.maxBudgetUsd,
      cwd: skillsDir,
      settingSources: ['user', 'project'],
      canUseTool: permissionHandler,
    };

    if (session.sdkSessionId) {
      options['resume'] = session.sdkSessionId;
    }

    if (config.agent.systemPrompt) {
      options['systemPrompt'] = config.agent.systemPrompt;
    }

    const queryOptions: Record<string, unknown> = {
      prompt: userMessage,
      options,
    };

    log.debug({ sessionId: session.id }, '调用 Claude Agent SDK');

    const result = sdk.query(queryOptions);
    let responseText = '';

    for await (const message of result) {
      if (message.type === 'assistant') {
        for (const block of message.message!.content) {
          if (block.type === 'text') responseText += block.text;
        }
      }
      if (message.type === 'result') {
        session.sdkSessionId = message.session_id;
        session.totalCostUsd += message.total_cost_usd ?? 0;
      }
    }

    log.info({
      sessionId: session.id,
      responseLength: responseText.length,
      totalCost: session.totalCostUsd,
    }, '消息处理完成 (SDK)');

    return responseText;
  }

  private async runWithAPI(session: Session, userMessage: string): Promise<string> {
    const provider = this.getActiveProvider();

    if (!provider) {
      return '未配置任何模型提供商。请运行 `hiveagent init` 配置模型。';
    }

    log.debug({ sessionId: session.id, provider: provider.name }, '使用直接 API 调用');

    try {
      let responseText: string;

      if (provider.name === 'ollama') {
        responseText = await this.callOllamaAPI(provider, userMessage);
      } else {
        responseText = await this.callAnthropicAPI(provider, userMessage);
      }

      log.info({ sessionId: session.id, responseLength: responseText.length }, '消息处理完成 (API)');
      return responseText;
    } catch (error) {
      log.error({ error }, 'API 请求失败');
      throw error;
    }
  }

  private async callAnthropicAPI(
    provider: { baseUrl: string; apiKey: string; model?: string },
    userMessage: string,
  ): Promise<string> {
    const response = await fetch(`${provider.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: provider.model ?? this.config.agent.model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: userMessage }],
        system: this.config.agent.systemPrompt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, body: errorText }, 'Anthropic API 调用失败');
      return `API 调用失败: ${response.status}`;
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string }>;
    };

    return data.content
      .filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('');
  }

  private async callOllamaAPI(
    provider: { baseUrl: string; model?: string },
    userMessage: string,
  ): Promise<string> {
    const messages = [
      ...(this.config.agent.systemPrompt
        ? [{ role: 'system', content: this.config.agent.systemPrompt }]
        : []),
      { role: 'user', content: userMessage },
    ];

    const response = await fetch(`${provider.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: provider.model ?? 'qwen3-coder',
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, body: errorText }, 'Ollama API 调用失败');
      return `Ollama API 调用失败: ${response.status}`;
    }

    const data = await response.json() as {
      message?: { content?: string };
    };

    return data.message?.content ?? '';
  }

  private getActiveProvider(): { name: string; baseUrl: string; apiKey: string; model?: string } | null {
    const { providers } = this.config;

    if (providers.agentterm?.enabled && providers.agentterm.apiKey) {
      return {
        name: 'agentterm',
        baseUrl: providers.agentterm.baseUrl ?? 'https://lite.beebywork.com/api/v1/anthropic-proxy',
        apiKey: providers.agentterm.apiKey,
      };
    }

    if (providers.anthropic?.enabled && providers.anthropic.apiKey) {
      return {
        name: 'anthropic',
        baseUrl: providers.anthropic.baseUrl ?? 'https://api.anthropic.com',
        apiKey: providers.anthropic.apiKey,
      };
    }

    if (providers.ollama?.enabled) {
      return {
        name: 'ollama',
        baseUrl: providers.ollama.baseUrl ?? 'http://localhost:11434',
        apiKey: '',
        model: providers.ollama.model,
      };
    }

    return null;
  }
}

// Claude Agent SDK 类型定义
interface ClaudeSDK {
  query(options: Record<string, unknown>): AsyncIterable<SDKMessage>;
}

interface SDKMessage {
  type: string;
  message?: {
    content: Array<{ type: string; text?: string }>;
  };
  session_id?: string;
  total_cost_usd?: number;
}
