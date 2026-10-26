import fs from 'fs-extra';
import path from 'path';
import http from 'http';
import * as H5P from '@lumieducation/h5p-server';
import boot_express_app from '../../src/express/app';
import User from '../../src/models/User';
import bunyan from 'bunyan';

async function runTestGate3() {
  console.log('=== RUNNING TEST GATE 3: DESKTOP AI STUDIO & EXPRESS SUITE ===\n');

  const testDir = path.resolve(process.cwd(), 'test-output-ai-studio');
  await fs.emptyDir(testDir);

  const libPath = path.resolve(process.cwd(), 'assets/h5p/libraries');
  const contentStorageDir = path.join(testDir, 'content');
  const tmpStorageDir = path.join(testDir, 'tmp');
  const settingsPath = path.join(testDir, 'settings.json');

  await fs.writeJson(settingsPath, {
    language: 'en',
    ai: {
      provider: 'ollama',
      ollama_endpoint: 'http://localhost:11434',
      ollama_model: 'llama3.2:latest'
    }
  });

  const libStorage = new H5P.fsImplementations.FileLibraryStorage(libPath);
  const contentStorage = new H5P.fsImplementations.FileContentStorage(contentStorageDir);
  const tmpStorage = new H5P.fsImplementations.DirectoryTemporaryFileStorage(tmpStorageDir);

  const config = new H5P.H5PConfig();
  config.baseUrl = '/h5p';
  config.coreApiVersion = { major: 1, minor: 27 };
  config.h5pVersion = '1.27';

  const h5pEditor = new H5P.H5PEditor(
    new H5P.fsImplementations.InMemoryStorage(),
    config,
    libStorage,
    contentStorage,
    tmpStorage
  );
  h5pEditor.setRenderer((model) => model);

  const h5pPlayer = new H5P.H5PPlayer(
    h5pEditor.libraryStorage,
    h5pEditor.contentStorage,
    config
  );
  h5pPlayer.setRenderer((model) => model);

  const log = bunyan.createLogger({ name: 'test-gate-3', level: 'fatal' });

  const ctx: any = {
    h5pEditor,
    h5pPlayer,
    log,
    is_development: false,
    language_code: 'en',
    paths: {
      settings: settingsPath,
      content: contentStorageDir,
      libraries: libPath,
      app: path.resolve(__dirname),
      tmp: tmpStorageDir
    }
  };

  const expressApp = await boot_express_app(ctx, log);
  const server = http.createServer(expressApp);

  const port = await new Promise<number>((resolve) => {
    server.listen(0, () => {
      resolve((server.address() as any).port);
    });
  });

  console.log(`✓ Test Express server running on ephemeral port: ${port}`);

  try {
    // 1. Test GET /ai-studio
    const studioRes = await fetch(`http://localhost:${port}/ai-studio`);
    if (studioRes.status !== 200) {
      throw new Error(`GET /ai-studio failed with status ${studioRes.status}`);
    }
    const studioHtml = await studioRes.text();
    if (!studioHtml.includes('Lumi AI Studio')) {
      throw new Error('GET /ai-studio returned invalid HTML content');
    }
    console.log('✓ GET /ai-studio delivered interactive studio HTML successfully');

    // 2. Test GET /api/v1/ai/providers
    const providersRes = await fetch(`http://localhost:${port}/api/v1/ai/providers`);
    if (providersRes.status !== 200) {
      throw new Error(`GET /api/v1/ai/providers failed with status ${providersRes.status}`);
    }
    const providersData = await providersRes.json();
    console.log('✓ GET /api/v1/ai/providers returned active status:', providersData.activeProvider);

    // 3. Test POST /api/v1/ai/compile-ir
    console.log('--- Testing /api/v1/ai/compile-ir endpoint ---');
    const irPayload = {
      title: 'Solar System Planetary Quiz',
      language: 'en',
      type: 'H5P.MultiChoice',
      question: 'Which planet is closest to the Sun?',
      answers: [
        { text: 'Mercury', correct: true, feedback: 'Correct! Mercury orbits closest to the Sun.' },
        { text: 'Venus', correct: false, feedback: 'Venus is second from the Sun.' },
        { text: 'Mars', correct: false }
      ],
      singleAnswer: true
    };

    const compileRes = await fetch(`http://localhost:${port}/api/v1/ai/compile-ir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ir: irPayload })
    });

    if (compileRes.status !== 200) {
      const errText = await compileRes.text();
      throw new Error(`POST /api/v1/ai/compile-ir failed with status ${compileRes.status}: ${errText}`);
    }

    const compileResult: any = await compileRes.json();
    if (!compileResult.contentId) {
      throw new Error('Missing contentId in compile-ir response');
    }
    console.log(`✓ Activity compiled & saved to storage with contentId: ${compileResult.contentId}`);

    // 4. Test GET /api/v1/content/:contentId/render
    const renderRes = await fetch(`http://localhost:${port}/api/v1/content/${compileResult.contentId}/render`);
    if (renderRes.status !== 200) {
      throw new Error(`GET /api/v1/content/:contentId/render failed with status ${renderRes.status}`);
    }
    const renderHtml = await renderRes.text();
    if (!renderHtml.includes('H5PIntegration') || !renderHtml.includes(compileResult.contentId)) {
      throw new Error('Rendered HTML missing H5PIntegration data or contentId');
    }
    console.log(`✓ Activity renders cleanly in H5P Player (${(renderHtml.length / 1024).toFixed(1)} KB)`);

    // 5. Test GET /api/v1/content/:contentId/edit
    const editRes = await fetch(`http://localhost:${port}/api/v1/content/${compileResult.contentId}/edit`);
    if (editRes.status !== 200) {
      throw new Error(`GET /api/v1/content/:contentId/edit failed with status ${editRes.status}`);
    }
    const editData: any = await editRes.json();
    if (!editData.h5p || !editData.h5p.params || !editData.h5p.params.answers) {
      throw new Error('Editor data model missing answers or parameters');
    }
    console.log(`✓ Activity opens cleanly in H5P Editor (title: "${editData.h5p.metadata.title}")`);

    console.log('\n======================================================');
    console.log('🎉 ALL TEST GATE 3 CHECKS PASSED WITH 100% SUCCESS! 🎉');
    console.log('======================================================\n');
  } finally {
    server.close();
  }
}

runTestGate3().catch((err) => {
  console.error('\n❌ TEST GATE 3 FAILED:', err);
  process.exit(1);
});
