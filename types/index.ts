// types/index.ts
import { createUserContent, createPartFromUri } from "npm:@google/genai";

// 定义接口和类型
export interface FileData {
  uri: string;
  mimeType: string;
}

export interface HistoryItem {
  role: string;
  text?: string;
  filedata?: string | FileData[];
}

export interface RequestData {
  apikey?: string;
  temperature?: number;
  systemInstruction?: string;
  modelName?: string;
  input?: string;
  fileURL?: string | string[];
  MessageHistory?: HistoryItem[];
}

export interface ResponseData {
  success: boolean;
  response: string;
  fileDatas: FileData[];
  error?: string;
  details?: string;
}

export type GeminiPart = { text: string } | ReturnType<typeof createPartFromUri>;
export type GeminiContent = ReturnType<typeof createUserContent>;

export interface GenerationConfig {
  temperature?: number;
}

export interface RequestOptions {
  model: string;
  contents: GeminiContent[];
  generationConfig?: GenerationConfig;
  safetySettings?: Array<Record<string, unknown>>;
  systemInstruction: string;
}