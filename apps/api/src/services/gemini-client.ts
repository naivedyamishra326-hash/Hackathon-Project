// ============================================================
// MCP Sentinel — Google Gemini Client Factory & Status Checker
// Uses the official @google/genai SDK with configurable model.
// ============================================================

import { GoogleGenAI } from '@google/genai';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load .env from workspace root if available
config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), 'apps/api/.env') });

export interface GeminiStatus {
  configured: boolean;
  model: string;
  clientReady: boolean;
  message?: string;
}

export class GeminiClientService {
  private client: GoogleGenAI | null = null;
  private model: string;
  private apiKey: string | null = null;
  private verified: boolean = false;
  private lastError: string | null = null;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || null;
    this.model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

    if (this.apiKey) {
      try {
        this.client = new GoogleGenAI({ apiKey: this.apiKey });
      } catch (err: any) {
        this.lastError = err.message || 'Initialization error';
      }
    }
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.client);
  }

  getModel(): string {
    return this.model;
  }

  getClient(): GoogleGenAI | null {
    return this.client;
  }

  /**
   * Health status check for Gemini integration without expensive generation.
   */
  async getStatus(): Promise<GeminiStatus> {
    if (!this.apiKey) {
      return {
        configured: false,
        model: this.model,
        clientReady: false,
        message: 'GEMINI_API_KEY is not set. Please configure GEMINI_API_KEY in .env to enable the Finance Bot.',
      };
    }

    if (!this.client) {
      return {
        configured: true,
        model: this.model,
        clientReady: false,
        message: this.lastError || 'Failed to initialize @google/genai client.',
      };
    }

    // Return status cleanly
    return {
      configured: true,
      model: this.model,
      clientReady: true,
      message: `Gemini client initialized with model ${this.model}`,
    };
  }
}

export const defaultGeminiClientService = new GeminiClientService();
