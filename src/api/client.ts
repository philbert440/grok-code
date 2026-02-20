import OpenAI from "openai";

export function createClient(apiKey: string) {
  return new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1' });
}