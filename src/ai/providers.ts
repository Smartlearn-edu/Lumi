export interface AIProviderConfig {
  provider: 'gemini' | 'openai' | 'claude' | 'ollama' | 'deepseek';
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

      case 'deepseek':
        rawOutput = await this.callDeepSeek(systemPrompt, userPrompt, request.config);
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

  /**
   * Helper to format network errors with deep diagnostic details from err.cause
   */
  private static handleFetchError(err: any, provider: string, hostOrUrl: string): never {
    const causeMsg = err.cause?.message || (err.cause ? String(err.cause) : '');
    const code = err.cause?.code || err.code || '';
    let details = `${provider} network connection error (${hostOrUrl}): ${err.message}`;
    if (causeMsg) details += ` | Underlying cause: ${causeMsg}`;
    if (code) details += ` [Code: ${code}]`;

    const error = new Error(details);
    (error as any).cause = err.cause;
    (error as any).code = code;
    (error as any).provider = provider;
    throw error;
  }

  /**
   * Parse structured JSON error responses from LLM APIs
   */
  private static parseHttpErrorMessage(rawText: string): string {
    try {
      const json = JSON.parse(rawText);
      if (json.error?.message) return json.error.message;
      if (json.message) return json.message;
      if (typeof json.error === 'string') return json.error;
    } catch {}
    return rawText;
  }

  /**
   * Generate an intelligent plain-English diagnostic hint for the user
   */
  public static getDiagnosticHint(err: any, provider: string): string {
    const msg = (err?.message || '').toLowerCase();
    const cause = (err?.cause?.message || err?.cause || '').toString().toLowerCase();
    const code = (err?.code || err?.cause?.code || '').toString().toUpperCase();

    if (code === 'ENOTFOUND' || msg.includes('enotfound') || cause.includes('enotfound') || (msg.includes('fetch failed') && !code)) {
      if (provider === 'gemini') {
        return 'Cannot connect to Google Gemini (DNS/Network resolution failed). Google Gemini API may be geo-blocked or restricted on your network/country/ISP. Try switching to DeepSeek or Local Ollama!';
      }
      return `Cannot resolve server address for ${provider}. Please verify your internet connection or DNS/proxy settings.`;
    }

    if (code === 'ECONNREFUSED' || msg.includes('econnrefused') || cause.includes('econnrefused')) {
      if (provider === 'ollama') {
        return 'Connection refused by local Ollama port 11434. Make sure Ollama is installed and running in your terminal ("ollama serve").';
      }
      return `Connection refused by ${provider} endpoint. Check if a local firewall or proxy is blocking the port.`;
    }

    if (code === 'ETIMEDOUT' || msg.includes('etimedout') || cause.includes('timed out') || msg.includes('timeout')) {
      return `Connection to ${provider} timed out. The server took too long to respond. Check if your network connection or VPN is slow or unstable.`;
    }

    if (msg.includes('401') || msg.includes('api key not valid') || msg.includes('invalid api key') || msg.includes('unauthorized') || msg.includes('invalid_argument')) {
      return `Authentication failed: The ${provider} API Key provided is either invalid, revoked, or expired. Please check your API key in settings.`;
    }

    if (msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota') || msg.includes('rate limit')) {
      return `Rate limit or quota exhausted (HTTP 429). Your ${provider} account has hit its token/request limit. Try waiting a minute, topping up credits, or switching to DeepSeek / Ollama.`;
    }

    if (msg.includes('403') || msg.includes('permission_denied')) {
      return `Access forbidden (HTTP 403). The API is not enabled for your project, or access is not supported in your country/region without a VPN.`;
    }

    return `The request to ${provider} failed. Please review the debug details below or try another AI provider.`;
  }

  private static async callOllama(systemPrompt: string, userPrompt: string, config: AIProviderConfig): Promise<string> {
    const endpoint = config.endpoint || 'http://localhost:11434';
    const model = config.model || 'llama3.2:latest';

    let response: Response;
    try {
      response = await fetch(`${endpoint.replace(/\/+$/, '')}/api/chat`, {
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
    } catch (err: any) {
      this.handleFetchError(err, 'Ollama', endpoint);
    }

    if (!response.ok) {
      const errorText = await response.text();
      const parsed = this.parseHttpErrorMessage(errorText);
      throw new Error(`Ollama error (HTTP ${response.status}): ${parsed}`);
    }

    const data: any = await response.json();
    return data.message?.content || '';
  }

  private static async callGemini(systemPrompt: string, userPrompt: string, config: AIProviderConfig): Promise<string> {
    const apiKey = config.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Missing Gemini API Key. Please enter your API key in the AI Studio settings.');
    const model = config.model || 'gemini-1.5-flash';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    let response: Response;
    try {
      response = await fetch(url, {
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
    } catch (err: any) {
      this.handleFetchError(err, 'Gemini', 'generativelanguage.googleapis.com');
    }

    if (!response.ok) {
      const errorText = await response.text();
      const parsed = this.parseHttpErrorMessage(errorText);
      throw new Error(`Gemini API error (HTTP ${response.status}): ${parsed}`);
    }

    const data: any = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  private static async callDeepSeek(systemPrompt: string, userPrompt: string, config: AIProviderConfig): Promise<string> {
    const apiKey = config.apiKey || process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('Missing DeepSeek API Key. Please enter your DeepSeek API key in the AI Studio settings.');
    const model = config.model || 'deepseek-chat';
    const endpoint = config.endpoint || 'https://api.deepseek.com/chat/completions';

    let response: Response;
    try {
      response = await fetch(endpoint, {
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
    } catch (err: any) {
      this.handleFetchError(err, 'DeepSeek', 'api.deepseek.com');
    }

    if (!response.ok) {
      const errorText = await response.text();
      const parsed = this.parseHttpErrorMessage(errorText);
      throw new Error(`DeepSeek API error (HTTP ${response.status}): ${parsed}`);
    }

    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  private static async callOpenAI(systemPrompt: string, userPrompt: string, config: AIProviderConfig): Promise<string> {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('Missing OpenAI API Key. Please enter your OpenAI key in settings.');
    const model = config.model || 'gpt-4o-mini';

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
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
    } catch (err: any) {
      this.handleFetchError(err, 'OpenAI', 'api.openai.com');
    }

    if (!response.ok) {
      const errorText = await response.text();
      const parsed = this.parseHttpErrorMessage(errorText);
      throw new Error(`OpenAI API error (HTTP ${response.status}): ${parsed}`);
    }

    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  private static async callClaude(systemPrompt: string, userPrompt: string, config: AIProviderConfig): Promise<string> {
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Missing Anthropic API Key. Please enter your Claude key in settings.');
    const model = config.model || 'claude-3-5-haiku-20241022';

    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
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
    } catch (err: any) {
      this.handleFetchError(err, 'Claude', 'api.anthropic.com');
    }

    if (!response.ok) {
      const errorText = await response.text();
      const parsed = this.parseHttpErrorMessage(errorText);
      throw new Error(`Claude API error (HTTP ${response.status}): ${parsed}`);
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
