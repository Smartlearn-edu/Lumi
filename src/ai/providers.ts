export interface AIProviderConfig {
  provider: 'gemini' | 'openai' | 'claude' | 'ollama';
  apiKey?: string;
  model?: string;
  endpoint?: string;
  temperature?: number;
}

export interface AIGenerationRequest {
  prompt: string;
  contentType: string; // e.g. "H5P.MultiChoice", "H5P.CoursePresentation", etc.
  documentContext?: string;
  language?: string;
  config: AIProviderConfig;
}

export class AIService {
  /**
   * Generates a Pedagogical IR JSON payload using the configured provider.
   */
  public static async generateIR(request: AIGenerationRequest): Promise<any> {
    const systemPrompt = `You are an expert instructional designer and H5P author.
Your task is to generate an interactive educational activity as a strict JSON object conforming to the Compact Pedagogical IR schema for "${request.contentType}".

Rules:
1. Output ONLY a valid JSON object. No explanations, no markdown codeblocks, no commentary.
2. The JSON object MUST have:
   - "title": a clear, engaging title
   - "language": "${request.language || 'en'}"
   - "type": "${request.contentType}"
3. Provide rich pedagogical content with helpful tips and explanations for answers.
4. For CoursePresentation, use valid slide layouts ("title-slide", "header-bullets", "text-left-image-right", "full-slide-quiz").
5. For Blanks, use "*answer:hint*" syntax or structured blanks array.`;

    const userPrompt = `Target Activity: ${request.contentType}
Topic / Instructions: ${request.prompt}
${request.documentContext ? `\nReference Material / Notes:\n"""\n${request.documentContext}\n"""` : ''}

Generate the complete Pedagogical IR JSON object:`;

    let rawOutput = '';

    switch (request.config.provider) {
      case 'ollama':
        rawOutput = await this.callOllama(systemPrompt, userPrompt, request.config);
        break;

      case 'gemini':
        rawOutput = await this.callGemini(systemPrompt, userPrompt, request.config);
        break;

      case 'openai':
        rawOutput = await this.callOpenAI(systemPrompt, userPrompt, request.config);
        break;

      case 'claude':
        rawOutput = await this.callClaude(systemPrompt, userPrompt, request.config);
        break;

      default:
        throw new Error(`Unsupported AI provider: ${request.config.provider}`);
    }

    return this.parseCleanJson(rawOutput);
  }

  public static async checkOllama(endpoint: string = 'http://localhost:11434'): Promise<{ available: boolean; models: string[] }> {
    try {
      const response = await fetch(`${endpoint.replace(/\/+$/, '')}/api/tags`);
      if (!response.ok) return { available: false, models: [] };
      const data: any = await response.json();
      const models = (data.models || []).map((m: any) => m.name);
      return { available: true, models };
    } catch {
      return { available: false, models: [] };
    }
  }

  private static async callOllama(systemPrompt: string, userPrompt: string, config: AIProviderConfig): Promise<string> {
    const endpoint = config.endpoint || 'http://localhost:11434';
    const model = config.model || 'llama3.2:latest';

    const response = await fetch(`${endpoint.replace(/\/+$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false,
        options: {
          temperature: config.temperature ?? 0.3
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data: any = await response.json();
    return data.message?.content || '';
  }

  private static async callGemini(systemPrompt: string, userPrompt: string, config: AIProviderConfig): Promise<string> {
    const apiKey = config.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Missing Gemini API Key');
    const model = config.model || 'gemini-1.5-flash';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: config.temperature ?? 0.3,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${errorText}`);
    }

    const data: any = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  private static async callOpenAI(systemPrompt: string, userPrompt: string, config: AIProviderConfig): Promise<string> {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('Missing OpenAI API Key');
    const model = config.model || 'gpt-4o-mini';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: config.temperature ?? 0.3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  private static async callClaude(systemPrompt: string, userPrompt: string, config: AIProviderConfig): Promise<string> {
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Missing Anthropic API Key');
    const model = config.model || 'claude-3-5-haiku-20241022';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 4096,
        temperature: config.temperature ?? 0.3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} ${errorText}`);
    }

    const data: any = await response.json();
    return data.content?.[0]?.text || '';
  }

  public static parseCleanJson(text: string): any {
    let cleaned = text.trim();
    // Strip markdown codeblocks if present
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '');
    }
    cleaned = cleaned.trim();
    return JSON.parse(cleaned);
  }
}
