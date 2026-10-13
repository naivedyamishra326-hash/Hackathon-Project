// ============================================================
// MCP Sentinel — Finance Conversation Store
// Maintains server-side conversation history and turn state.
// ============================================================

import { nowISO } from '@mcp-sentinel/shared';
import type { PendingRefund } from './refund-confirmation-service.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'tool';
  text: string;
  timestamp: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    result?: unknown;
    decision?: string;
  }>;
  pendingRefund?: PendingRefund;
}

export interface ConversationSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  accountId?: string;
}

export class FinanceConversationStore {
  private sessions: Map<string, ConversationSession> = new Map();

  getOrCreateSession(sessionId: string, defaultAccountId?: string): ConversationSession {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        createdAt: nowISO(),
        updatedAt: nowISO(),
        messages: [],
        accountId: defaultAccountId || 'ACC-1001',
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  getSession(sessionId: string): ConversationSession | null {
    return this.sessions.get(sessionId) || null;
  }

  addMessage(sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
    const session = this.getOrCreateSession(sessionId);
    const fullMessage: ChatMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: nowISO(),
    };

    session.messages.push(fullMessage);
    session.updatedAt = nowISO();
    return fullMessage;
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  clear(): void {
    this.sessions.clear();
  }
}

export const defaultConversationStore = new FinanceConversationStore();
