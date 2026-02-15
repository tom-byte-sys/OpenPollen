import pino from 'pino';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// 默认 logger 为 silent，防止 CLI 子命令泄漏日志到终端
// 需要显式调用 initLogger() 才会启用日志输出
let logger: pino.Logger = pino({ level: 'silent' });

export function initLogger(options: { level?: string; file?: string; stdout?: boolean } = {}): pino.Logger {
  const targets: pino.TransportTargetOptions[] = [];

  // stdout 目标：仅在显式启用时添加
  if (options.stdout) {
    targets.push({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
      },
      level: options.level ?? 'info',
    });
  }

  // 文件目标
  if (options.file) {
    const dir = dirname(options.file);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    targets.push({
      target: 'pino/file',
      options: { destination: options.file },
      level: options.level ?? 'info',
    });
  }

  // 如果没有任何目标，至少保留一个 stdout（开发模式兜底）
  if (targets.length === 0) {
    targets.push({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
      },
      level: options.level ?? 'info',
    });
  }

  logger = pino({
    level: options.level ?? 'info',
    transport: { targets },
  });

  return logger;
}

export function getLogger(name?: string): pino.Logger {
  return name ? logger.child({ module: name }) : logger;
}

export { logger };
