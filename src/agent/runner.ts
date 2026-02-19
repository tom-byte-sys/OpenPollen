import { existsSync, mkdirSync, symlinkSync, readlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { getLogger } from '../utils/logger.js';
import type { Session } from '../gateway/session.js';
import type { AppConfig } from '../config/schema.js';
import type { MemoryStore } from '../memory/interface.js';
import { SkillManager } from './skill-manager.js';

const log = getLogger('agent-runner');

const BEELIVE_PROXY_URL = process.env.BEELIVE_PROXY_URL || 'https://api.openpollen.dev/api/v1/anthropic-proxy';

export interface AgentRunnerOptions {
  config: AppConfig;
  skillManager: SkillManager;
  memory: MemoryStore;
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
  private memory: MemoryStore;
  private sdk: ClaudeAgentSDK | null = null;

  constructor(options: AgentRunnerOptions) {
    this.config = options.config;
    this.skillManager = options.skillManager;
    this.memory = options.memory;
  }

  /**
   * 运行 Agent 处理用户消息
   */
  async run(session: Session, userMessage: string, onChunk?: (text: string) => void): Promise<string> {
    log.info({
      sessionId: session.id,
      messageLength: userMessage.length,
    }, '开始处理消息');

    try {
      // Layer 1: 从 memory 恢复 SDK 会话 ID
      if (!session.sdkSessionId) {
        const savedSessionId = await this.memory.get('sdk-sessions', session.channelId);
        if (savedSessionId) {
          session.sdkSessionId = savedSessionId;
          log.info({ sessionId: session.id, sdkSessionId: savedSessionId }, '从 memory 恢复 SDK 会话 ID');
        }
      }

      const sdk = await this.loadSDK();
      return await this.runWithSDK(sdk, session, userMessage, onChunk);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : undefined;
      log.error({ sessionId: session.id, error: errMsg, stack: errStack }, 'Agent 执行失败');
      throw error;
    }
  }

  private async loadSDK(): Promise<ClaudeAgentSDK> {
    if (this.sdk) return this.sdk;

    try {
      const mod = await import('@anthropic-ai/claude-agent-sdk');
      if (typeof mod.query === 'function') {
        this.sdk = mod as ClaudeAgentSDK;
        log.info('Claude Agent SDK 加载成功');
        return this.sdk;
      }
      throw new Error('Claude Agent SDK 模块未导出 query 函数');
    } catch (err) {
      if (err instanceof Error && err.message.includes('未导出 query')) {
        throw err;
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Claude Agent SDK 加载失败: ${errMsg}`);
    }
  }

  private async runWithSDK(sdk: ClaudeAgentSDK, session: Session, userMessage: string, onChunk?: (text: string) => void): Promise<string> {
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
        ...this.resolveProviderEnv(),
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

    // 构建系统提示：基础提示 + 用户上下文
    let appendPrompt = config.agent.systemPrompt ?? '';

    // Layer 2: 无 SDK 会话可恢复时，注入用户历史上下文
    if (!session.sdkSessionId) {
      const userContext = await this.loadUserContext(session.userId);
      if (userContext) {
        appendPrompt = appendPrompt
          ? `${appendPrompt}\n\n${userContext}`
          : userContext;
      }
    }

    if (appendPrompt) {
      options['systemPrompt'] = {
        type: 'preset',
        preset: 'claude_code',
        append: appendPrompt,
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

      // 流式事件 - 实时推送增量文本
      if (message.type === 'stream_event' && onChunk) {
        const event = (message as unknown as Record<string, unknown>).event as Record<string, unknown> | undefined;
        if (event?.type === 'content_block_delta') {
          const delta = event.delta as Record<string, unknown> | undefined;
          if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
            onChunk(delta.text);
          }
        }
      }

      // 结果消息 - 保存 session_id 和费用
      if (message.type === 'result') {
        if (message.session_id) {
          session.sdkSessionId = message.session_id;

          // Layer 1: 持久化 SDK 会话 ID 到 memory
          try {
            await this.memory.set('sdk-sessions', session.channelId, message.session_id);
          } catch (err) {
            log.warn({ error: err }, '持久化 SDK 会话 ID 失败');
          }

          // 更新会话历史
          await this.updateSessionHistory(session.userId, message.session_id, userMessage);
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

  /**
   * 创建或更新会话历史条目
   */
  private async updateSessionHistory(userId: string, sdkSessionId: string, userMessage: string): Promise<void> {
    const historyNamespace = `sdk-session-history:${userId}`;
    try {
      const existing = await this.memory.get(historyNamespace, sdkSessionId);
      const now = Date.now();

      if (existing) {
        // 已存在：更新 lastActiveAt
        const data = JSON.parse(existing) as { sdkSessionId: string; createdAt: number; lastActiveAt: number; preview: string };
        data.lastActiveAt = now;
        await this.memory.set(historyNamespace, sdkSessionId, JSON.stringify(data));
      } else {
        // 首次创建：preview 取用户消息前 50 字符
        const entry = {
          sdkSessionId,
          createdAt: now,
          lastActiveAt: now,
          preview: userMessage.slice(0, 50),
        };
        await this.memory.set(historyNamespace, sdkSessionId, JSON.stringify(entry));
      }
    } catch (err) {
      log.warn({ error: err, userId, sdkSessionId }, '更新会话历史失败');
    }
  }

  /**
   * 加载用户历史上下文摘要
   */
  private async loadUserContext(userId: string): Promise<string | null> {
    try {
      const entries = await this.memory.list(`user:${userId}`);
      if (entries.length === 0) return null;

      // 按创建时间排序，取最近 5 条
      const sorted = entries
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5);

      const lines = sorted.map(e => e.value);
      return `## 用户历史对话摘要\n${lines.join('\n')}`;
    } catch (err) {
      log.warn({ error: err, userId }, '加载用户上下文失败');
      return null;
    }
  }

  /**
   * 按优先级解析 providers 配置，映射为 SDK 环境变量
   * 优先级: beelive > agentterm(兼容) > anthropic > ollama
   */
  private resolveProviderEnv(): Record<string, string> {
    const { providers } = this.config;
    const env: Record<string, string> = {};

    // beelive 平台（新配置名）
    if (providers.beelive?.enabled && providers.beelive.apiKey) {
      env['ANTHROPIC_API_KEY'] = providers.beelive.apiKey;
      env['ANTHROPIC_BASE_URL'] = providers.beelive.baseUrl || BEELIVE_PROXY_URL;
      log.info('使用 Beelive 聚合平台');
      return env;
    }

    // 向后兼容旧的 agentterm 配置名
    if (providers.agentterm?.enabled && providers.agentterm.apiKey) {
      env['ANTHROPIC_API_KEY'] = providers.agentterm.apiKey;
      env['ANTHROPIC_BASE_URL'] = providers.agentterm.baseUrl || BEELIVE_PROXY_URL;
      log.info('使用 Beelive 聚合平台 (兼容 agentterm 配置)');
      return env;
    }

    if (providers.anthropic?.enabled && providers.anthropic.apiKey) {
      env['ANTHROPIC_API_KEY'] = providers.anthropic.apiKey;
      if (providers.anthropic.baseUrl) {
        env['ANTHROPIC_BASE_URL'] = providers.anthropic.baseUrl;
      }
      log.info('使用 Anthropic API');
      return env;
    }

    if (providers.ollama?.enabled && providers.ollama.baseUrl) {
      env['ANTHROPIC_BASE_URL'] = providers.ollama.baseUrl;
      if (providers.ollama.apiKey) {
        env['ANTHROPIC_API_KEY'] = providers.ollama.apiKey;
      }
      log.info('使用 Ollama 本地模型');
      return env;
    }

    return env;
  }

  /**
   * 创建专用 SDK 工作空间目录
   * 避免使用项目根目录作为 cwd（会加载 CLAUDE.md 导致 cache_control 块过多）
   * 结构：~/.openpollen/sdk-workspace/.claude/skills/ -> 实际技能目录
   */
  private async ensureSDKWorkspace(skillsDir: string): Promise<string> {
    const workspaceDir = resolve(process.env.HOME ?? '/tmp', '.openpollen', 'sdk-workspace');
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
}
