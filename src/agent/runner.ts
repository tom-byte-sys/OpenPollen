import { existsSync, mkdirSync, symlinkSync, readlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { getLogger } from '../utils/logger.js';
import type { Session } from '../gateway/session.js';
import type { AppConfig } from '../config/schema.js';
import { SkillManager } from './skill-manager.js';

const log = getLogger('agent-runner');

export interface AgentRunnerOptions {
  config: AppConfig;
  skillManager: SkillManager;
}

// Claude Agent SDK 类型（从 @anthropic-ai/claude-agent-sdk 导入）
interface ClaudeAgentSDK {
  query(params: { prompt: string; options?: Record<string, unknown> }): AsyncGenerator<SDKMessage, void>;
}

interface SDKMessage {
  type: string;
  subtype?: string;
  // system init 消息
  tools?: string[];
  skills?: string[];
  cwd?: string;
  model?: string;
  claude_code_version?: string;
  mcp_servers?: Array<{ name: string; status: string }>;
  permissionMode?: string;
  session_id?: string;
  // assistant 消息
  message?: {
    content: Array<{ type: string; text?: string; name?: string }>;
  };
  // result 消息
  subType?: string;
  total_cost_usd?: number;
  result?: string;
  is_error?: boolean;
  num_turns?: number;
  uuid?: string;
}

export class AgentRunner {
  private config: AppConfig;
  private skillManager: SkillManager;
  private sdk: ClaudeAgentSDK | null = null;

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
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : undefined;
      log.error({ sessionId: session.id, error: errMsg, stack: errStack }, 'Agent 执行失败');
      throw error;
    }
  }

  private async loadSDK(): Promise<ClaudeAgentSDK | null> {
    if (this.sdk) return this.sdk;

    try {
      const mod = await import('@anthropic-ai/claude-agent-sdk');
      if (typeof mod.query === 'function') {
        this.sdk = mod as ClaudeAgentSDK;
        log.info('Claude Agent SDK 加载成功');
        return this.sdk;
      }
      log.warn('Claude Agent SDK 模块未导出 query 函数');
      return null;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.debug({ error: errMsg }, 'Claude Agent SDK 未安装，使用直接 API 模式');
      return null;
    }
  }

  private async runWithSDK(sdk: ClaudeAgentSDK, session: Session, userMessage: string): Promise<string> {
    const { config, skillManager } = this;
    const skillsDir = skillManager['skillsDir'];

    // 创建专用 SDK 工作目录，避免加载项目 CLAUDE.md 导致 cache_control 块过多
    const sdkWorkspace = await this.ensureSDKWorkspace(skillsDir);

    const options: Record<string, unknown> = {
      model: session.model ?? config.agent.model,
      maxTurns: config.agent.maxTurns,
      maxBudgetUsd: config.agent.maxBudgetUsd,
      cwd: sdkWorkspace,
      settingSources: ['project'],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      includePartialMessages: true,
      env: {
        ...process.env,
        CLAUDECODE: '',  // 避免嵌套会话检测
      },
      stderr: (data: string) => {
        if (data.trim()) {
          log.debug({ sessionId: session.id, stderr: data.trim() }, 'SDK stderr');
        }
      },
    };

    if (session.sdkSessionId) {
      options['resume'] = session.sdkSessionId;
      log.info({ sessionId: session.id, sdkSessionId: session.sdkSessionId }, '恢复 SDK 会话');
    }

    if (config.agent.systemPrompt) {
      // 使用 append 模式：将自定义提示追加到 SDK 默认 Claude Code 系统提示
      // 避免产生额外的 cache_control 块（API 限制最多 4 个）
      options['systemPrompt'] = {
        type: 'preset',
        preset: 'claude_code',
        append: config.agent.systemPrompt,
      };
    }

    log.info({ sessionId: session.id, cwd: sdkWorkspace, model: options['model'] }, '调用 Claude Agent SDK');

    const result = sdk.query({ prompt: userMessage, options });
    let responseText = '';
    const toolsUsed: string[] = [];

    for await (const message of result) {
      // 系统初始化消息
      if (message.type === 'system' && message.subtype === 'init') {
        log.info({
          sessionId: session.id,
          sdkVersion: message.claude_code_version,
          tools: message.tools,
          skills: message.skills,
          model: message.model,
          cwd: message.cwd,
          permissionMode: message.permissionMode,
          mcpServers: message.mcp_servers,
        }, 'SDK 初始化完成');
      }

      // 助手消息 - 提取文本和工具调用
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'text' && block.text) {
            responseText += block.text;
          }
          if (block.type === 'tool_use' && block.name) {
            toolsUsed.push(block.name);
            log.info({ sessionId: session.id, tool: block.name }, 'SDK 调用工具');
          }
        }
      }

      // 结果消息 - 保存 session_id 和费用
      if (message.type === 'result') {
        if (message.session_id) {
          session.sdkSessionId = message.session_id;
        }
        session.totalCostUsd += message.total_cost_usd ?? 0;

        log.info({
          sessionId: session.id,
          sdkSessionId: message.session_id,
          totalCost: message.total_cost_usd,
          numTurns: message.num_turns,
          isError: message.is_error,
        }, 'SDK 执行结果');

        // 如果 responseText 为空但有 result 字段，使用 result
        if (!responseText && message.result) {
          responseText = message.result;
        }
      }
    }

    log.info({
      sessionId: session.id,
      responseLength: responseText.length,
      totalCost: session.totalCostUsd,
      toolsUsed,
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

  /**
   * 创建专用 SDK 工作空间目录
   * 避免使用项目根目录作为 cwd（会加载 CLAUDE.md 导致 cache_control 块过多）
   * 结构：~/.hiveagent/sdk-workspace/.claude/skills/ -> 实际技能目录
   */
  private async ensureSDKWorkspace(skillsDir: string): Promise<string> {
    const workspaceDir = resolve(process.env.HOME ?? '/tmp', '.hiveagent', 'sdk-workspace');
    const dotClaudeDir = join(workspaceDir, '.claude');
    const dotClaudeSkillsDir = join(dotClaudeDir, 'skills');

    // 确保工作空间目录存在
    if (!existsSync(workspaceDir)) {
      mkdirSync(workspaceDir, { recursive: true });
    }

    // 确保 .claude 目录存在
    if (!existsSync(dotClaudeDir)) {
      mkdirSync(dotClaudeDir, { recursive: true });
    }

    // 确保 .claude/skills 符号链接指向实际技能目录
    const resolvedSkillsDir = resolve(skillsDir);
    if (existsSync(dotClaudeSkillsDir)) {
      try {
        const target = readlinkSync(dotClaudeSkillsDir);
        if (resolve(workspaceDir, target) === resolvedSkillsDir || target === resolvedSkillsDir) {
          return workspaceDir;
        }
        // 符号链接指向了错误的目标，删除重建
        const { unlinkSync } = await import('node:fs');
        unlinkSync(dotClaudeSkillsDir);
      } catch {
        // 不是符号链接（可能是普通目录），直接返回
        return workspaceDir;
      }
    }

    try {
      symlinkSync(resolvedSkillsDir, dotClaudeSkillsDir);
      log.info({ workspace: workspaceDir, skillsDir: resolvedSkillsDir }, 'SDK 工作空间已创建');
    } catch (error) {
      log.warn({ error }, '创建 Skills 符号链接失败');
    }

    return workspaceDir;
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
