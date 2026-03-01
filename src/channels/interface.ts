export interface MessageContent {
  type: 'text' | 'image' | 'audio' | 'file' | 'rich';
  text?: string;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
}

export interface ImageAttachment {
  mimeType: string;
  content: string; // base64
}

export interface InboundMessage {
  id: string;
  channelType: string;
  channelId: string;
  senderId: string;
  senderName: string;
  conversationType: 'dm' | 'group';
  groupId?: string;
  content: MessageContent;
  attachments?: ImageAttachment[];
  timestamp: number;
  raw?: unknown;
}

export interface OutboundMessage {
  conversationType: 'dm' | 'group';
  targetId: string;
  content: MessageContent;
  replyToMessageId?: string;
}

export interface ChannelAdapter {
  readonly name: string;
  readonly type: string;
  initialize(config: Record<string, unknown>): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(message: OutboundMessage): Promise<void>;
  onMessage(handler: (message: InboundMessage, onChunk?: (text: string) => void) => Promise<string | void>): void;
  isHealthy(): boolean;
}
