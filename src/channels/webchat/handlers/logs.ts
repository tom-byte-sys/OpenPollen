import { openSync, readSync, closeSync, statSync } from 'node:fs';
import { okResponse, errorResponse, type ResponseFrame } from '../protocol.js';
import type { AppConfig } from '../../../config/schema.js';

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_LINES = 2000;

interface LogsTailParams {
  cursor?: number;
  limit?: number;
  maxBytes?: number;
}

export function handleLogsTail(
  reqId: string,
  params: LogsTailParams | undefined,
  appConfig: AppConfig,
): ResponseFrame {
  const logFile = appConfig.logging.file;
  if (!logFile) {
    return errorResponse(reqId, 'NOT_FOUND', 'No log file configured (logging.file is not set)');
  }

  let fileSize: number;
  try {
    const stat = statSync(logFile);
    fileSize = stat.size;
  } catch {
    return errorResponse(reqId, 'NOT_FOUND', `Log file not found: ${logFile}`);
  }

  const limit = Math.min(params?.limit ?? 100, MAX_LINES);
  const maxBytes = Math.min(params?.maxBytes ?? 64 * 1024, MAX_BYTES);
  const cursor = params?.cursor;

  let startOffset: number;
  let reset = false;

  if (cursor !== undefined && cursor !== null) {
    if (cursor > fileSize) {
      // File was likely rotated
      reset = true;
      startOffset = Math.max(0, fileSize - maxBytes);
    } else {
      startOffset = cursor;
    }
  } else {
    // No cursor: read from tail
    startOffset = Math.max(0, fileSize - maxBytes);
  }

  const bytesToRead = Math.min(fileSize - startOffset, maxBytes);
  if (bytesToRead <= 0) {
    return okResponse(reqId, {
      lines: [],
      cursor: fileSize,
      fileSize,
      reset: false,
    });
  }

  let fd: number;
  try {
    fd = openSync(logFile, 'r');
  } catch (e) {
    return errorResponse(reqId, 'INTERNAL', `Cannot open log file: ${(e as Error).message}`);
  }

  try {
    const buffer = Buffer.alloc(bytesToRead);
    readSync(fd, buffer, 0, bytesToRead, startOffset);

    const text = buffer.toString('utf-8');
    let lines = text.split('\n');

    // If we started mid-file (no cursor, tail mode), drop the first partial line
    if (cursor === undefined && startOffset > 0) {
      lines = lines.slice(1);
    }

    // Remove trailing empty line from split
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    // Apply line limit (take last N lines)
    if (lines.length > limit) {
      lines = lines.slice(-limit);
    }

    const newCursor = startOffset + bytesToRead;

    return okResponse(reqId, {
      lines,
      cursor: newCursor,
      fileSize,
      reset,
    });
  } catch (e) {
    return errorResponse(reqId, 'INTERNAL', `Failed to read log file: ${(e as Error).message}`);
  } finally {
    closeSync(fd);
  }
}
