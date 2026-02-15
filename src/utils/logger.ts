import pino from 'pino';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

let logger: pino.Logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
    },
  },
});

export function initLogger(options: { level?: string; file?: string } = {}): pino.Logger {
  const targets: pino.TransportTargetOptions[] = [
    {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
      },
      level: options.level ?? 'info',
    },
  ];

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
