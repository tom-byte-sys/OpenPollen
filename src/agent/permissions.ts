import { getLogger } from '../utils/logger.js';
import type { Session } from '../gateway/session.js';

const log = getLogger('permissions');

export interface PermissionRule {
  tool: string;
  pattern?: string;  // glob pattern for allowed arguments
}

const DEFAULT_ALLOWED_TOOLS: PermissionRule[] = [
  { tool: 'Read' },
  { tool: 'Grep' },
  { tool: 'Glob' },
  { tool: 'WebSearch' },
  { tool: 'WebFetch' },
  { tool: 'Skill' },
];

const DANGEROUS_TOOLS = new Set([
  'Bash',
  'Write',
  'Edit',
  'NotebookEdit',
]);

export interface ToolUseRequest {
  tool: string;
  input: Record<string, unknown>;
}

/**
 * 创建权限检查处理器
 */
export function createPermissionHandler(
  session: Session,
  additionalRules: PermissionRule[] = [],
): (request: ToolUseRequest) => boolean {
  const allowedTools = new Set(
    [...DEFAULT_ALLOWED_TOOLS, ...additionalRules].map(r => r.tool),
  );

  return (request: ToolUseRequest): boolean => {
    const { tool, input } = request;

    // 默认白名单工具直接通过
    if (allowedTools.has(tool)) {
      log.debug({ sessionId: session.id, tool }, '工具使用已允许');
      return true;
    }

    // 危险工具默认拒绝
    if (DANGEROUS_TOOLS.has(tool)) {
      log.warn({
        sessionId: session.id,
        tool,
        input: JSON.stringify(input).slice(0, 200),
      }, '危险工具使用已拒绝');
      return false;
    }

    // 未知工具默认拒绝
    log.warn({ sessionId: session.id, tool }, '未知工具使用已拒绝');
    return false;
  };
}

/**
 * 从 SKILL.md frontmatter 解析 allowed-tools
 */
export function parseAllowedTools(allowedToolsStr: string): PermissionRule[] {
  return allowedToolsStr
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const match = entry.match(/^(\w+)(?:\((.+)\))?$/);
      if (!match) return { tool: entry };
      return {
        tool: match[1],
        pattern: match[2],
      };
    });
}
