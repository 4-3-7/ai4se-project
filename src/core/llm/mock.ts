import type { LLMProvider, LLMResponse, LLMOptions, Message, MockScript } from './types.js';

const DEFAULT_MOCK_RESPONSE: LLMResponse = {
  content: 'Mock response — no matching script.',
  usage: { input: 0, output: 0 },
  finishReason: 'stop',
};

export class MockLLMProvider implements LLMProvider {
  readonly providerId: string;
  readonly models: string[];
  private scripts: MockScript[];

  constructor(scripts: MockScript[] = [], providerId = 'mock') {
    this.scripts = scripts;
    this.providerId = providerId;
    this.models = ['mock-model'];
  }

  async complete(
    _messages: Message[],
    _options?: LLMOptions,
  ): Promise<LLMResponse> {
    for (const script of this.scripts) {
      if (script.match(_messages)) {
        return { ...script.response };
      }
    }
    return { ...DEFAULT_MOCK_RESPONSE };
  }
}