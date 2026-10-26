import * as Express from 'express';
import path from 'path';
import fs from 'fs-extra';
import { AIService, AIProviderConfig } from '../../ai/providers';
import { LibraryRegistry } from '../../cli/hydrator';
import { IRCompiler } from '../../cli/ir-compiler';
import settings_read from '../../ops/settings_read';
import settings_write from '../../ops/settings_write';

const router = Express.Router();

let sharedRegistry: LibraryRegistry | null = null;
async function getRegistry(ctx?: any): Promise<LibraryRegistry> {
  if (!sharedRegistry) {
    const candidatePaths = [
      ctx?.paths?.libraries,
      path.resolve(process.cwd(), 'assets/h5p/libraries'),
      path.resolve(__dirname, '../../../assets/h5p/libraries'),
      path.resolve(__dirname, '../../assets/h5p/libraries')
    ].filter(Boolean);

    const validPath = candidatePaths.find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), 'assets/h5p/libraries');
    sharedRegistry = new LibraryRegistry(validPath);
    await sharedRegistry.init();
  }
  return sharedRegistry;
}

// Serve the standalone AI Studio web application
router.get('/ai-studio', async (req: any, res: Express.Response) => {
  const rootDir = req.ctx?.paths?.app || path.resolve(process.cwd());
  let htmlPath = path.join(rootDir, 'assets/ai-studio/index.html');
  if (!fs.existsSync(htmlPath)) {
    htmlPath = path.resolve(__dirname, '../../../assets/ai-studio/index.html');
  }
  if (!fs.existsSync(htmlPath)) {
    htmlPath = path.resolve(process.cwd(), 'assets/ai-studio/index.html');
  }

  if (await fs.pathExists(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.status(404).send('AI Studio interface assets not found.');
  }
});

// Check status of AI providers and Ollama
router.get('/api/v1/ai/providers', async (req: any, res: Express.Response) => {
  try {
    const settings = await settings_read(req.ctx);
    const aiSettings = settings.ai || {};
    const ollamaStatus = await AIService.checkOllama(aiSettings.ollama_endpoint || 'http://localhost:11434');

    res.json({
      activeProvider: aiSettings.provider || (ollamaStatus.available ? 'ollama' : 'gemini'),
      geminiConfigured: !!(aiSettings.gemini_api_key || process.env.GEMINI_API_KEY),
      openaiConfigured: !!(aiSettings.openai_api_key || process.env.OPENAI_API_KEY),
      claudeConfigured: !!(aiSettings.claude_api_key || process.env.ANTHROPIC_API_KEY),
      ollama: ollamaStatus,
      settings: {
        provider: aiSettings.provider || 'ollama',
        ollama_endpoint: aiSettings.ollama_endpoint || 'http://localhost:11434',
        ollama_model: aiSettings.ollama_model || (ollamaStatus.models[0] || 'llama3.2:latest')
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update AI settings
router.post('/api/v1/ai/settings', async (req: any, res: Express.Response) => {
  try {
    const current = await settings_read(req.ctx);
    const updatedAi = {
      ...(current.ai || {}),
      ...req.body
    };
    await settings_write(req.ctx, { ai: updatedAi });
    res.json({ success: true, ai: updatedAi });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Directly compile a Pedagogical IR payload and save it into H5PEditor content storage
router.post('/api/v1/ai/compile-ir', async (req: any, res: Express.Response) => {
  try {
    const ir = req.body.ir;
    if (!ir || !ir.type) {
      return res.status(400).json({ error: 'Missing required "ir" object with "type".' });
    }

    const registry = await getRegistry(req.ctx);
    const compiler = new IRCompiler(registry);
    const compiled = await compiler.compile(ir);

    const ubername = `${compiled.mainLibrary.machineName} ${compiled.mainLibrary.majorVersion}.${compiled.mainLibrary.minorVersion}`;

    const { id, metadata } = await req.ctx.h5pEditor.saveOrUpdateContentReturnMetaData(
      undefined,
      compiled.contentJson,
      compiled.h5pJson,
      ubername,
      req.user
    );

    res.json({
      success: true,
      contentId: id,
      title: metadata.title || ir.title,
      ubername,
      editUrl: `/content/${id}`,
      renderUrl: `/api/v1/content/${id}/render`
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// End-to-end prompt/document to H5P generation
router.post('/api/v1/ai/generate', async (req: any, res: Express.Response) => {
  try {
    const { prompt, contentType, documentContext, language, providerConfig } = req.body;
    if (!prompt || !contentType) {
      return res.status(400).json({ error: 'Missing prompt or contentType' });
    }

    const settings = await settings_read(req.ctx);
    const aiSettings = settings.ai || {};

    const resolvedConfig: AIProviderConfig = {
      provider: providerConfig?.provider || aiSettings.provider || 'gemini',
      apiKey: providerConfig?.apiKey || aiSettings[`${providerConfig?.provider || aiSettings.provider}_api_key`],
      model: providerConfig?.model || aiSettings[`${providerConfig?.provider || aiSettings.provider}_model`],
      endpoint: providerConfig?.endpoint || aiSettings.ollama_endpoint,
      temperature: providerConfig?.temperature ?? 0.3
    };

    const ir = await AIService.generateIR({
      prompt,
      contentType,
      documentContext,
      language: language || req.language || 'en',
      config: resolvedConfig
    });

    const registry = await getRegistry(req.ctx);
    const compiler = new IRCompiler(registry);
    const compiled = await compiler.compile(ir);

    const ubername = `${compiled.mainLibrary.machineName} ${compiled.mainLibrary.majorVersion}.${compiled.mainLibrary.minorVersion}`;

    const { id, metadata } = await req.ctx.h5pEditor.saveOrUpdateContentReturnMetaData(
      undefined,
      compiled.contentJson,
      compiled.h5pJson,
      ubername,
      req.user
    );

    res.json({
      success: true,
      contentId: id,
      title: metadata.title || ir.title,
      ubername,
      ir,
      editUrl: `/content/${id}`,
      renderUrl: `/api/v1/content/${id}/render`
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
