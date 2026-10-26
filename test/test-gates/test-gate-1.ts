import fs from 'fs-extra';
import path from 'path';
import { LibraryRegistry } from '../../src/cli/hydrator';
import { IRCompiler } from '../../src/cli/ir-compiler';
import { H5PPackager } from '../../src/cli/h5p-packager';
import * as H5P from '@lumieducation/h5p-server';
import User from '../../src/models/User';

async function runTestGate1() {
  console.log('=== RUNNING TEST GATE 1: CLI, HYDRATOR & PACKAGING SUITE ===\n');
  const testDir = path.resolve(__dirname, 'test-output');
  await fs.emptyDir(testDir);

  const registry = new LibraryRegistry(path.resolve(__dirname, 'assets/h5p/libraries'));
  await registry.init();
  const compiler = new IRCompiler(registry);
  const packager = new H5PPackager(registry);

  // 1. Create a dummy test SVG diagram
  const svgPath = path.join(testDir, 'cell-diagram.svg');
  await fs.writeFile(
    svgPath,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
      <rect width="800" height="600" fill="#f0f8ff" rx="20"/>
      <circle cx="400" cy="300" r="150" fill="#87cefa" stroke="#4682b4" stroke-width="4"/>
      <circle cx="400" cy="300" r="50" fill="#ff6347"/>
      <text x="400" y="305" font-family="Arial" font-size="18" text-anchor="middle" fill="#ffffff">Nucleus</text>
      <text x="400" y="550" font-family="Arial" font-size="24" text-anchor="middle" fill="#333333">Animal Cell Diagram</text>
    </svg>`,
    'utf8'
  );

  // Setup H5P Validator engine to verify round-trip
  const testUserData = path.join(testDir, 'h5p_userdata');
  const libStorage = new H5P.fsImplementations.FileLibraryStorage(path.join(testUserData, 'libraries'));
  const contentStorage = new H5P.fsImplementations.FileContentStorage(path.join(testUserData, 'content'));
  const tmpStorage = new H5P.fsImplementations.DirectoryTemporaryFileStorage(path.join(testUserData, 'tmp'));
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

  // Test 1.2: Atomic Content Types
  console.log('--- Testing Tier A Atomic Content Types ---');

  // MultiChoice
  const mcIR = {
    title: 'Photosynthesis Quiz',
    type: 'H5P.MultiChoice',
    question: 'Which gas is released during photosynthesis?',
    answers: [
      { text: 'Oxygen', correct: true, feedback: 'Correct! O2 is released as a byproduct.' },
      { text: 'Carbon Dioxide', correct: false, feedback: 'CO2 is absorbed, not released.' },
      { text: 'Nitrogen', correct: false }
    ],
    singleAnswer: true
  };
  const mcCompiled = await compiler.compile(mcIR, testDir);
  const mcPath = path.join(testDir, 'multichoice.h5p');
  await packager.packCompiled(mcCompiled, mcPath);
  console.log('✓ MultiChoice compiled & packed');

  // TrueFalse
  const tfIR = {
    title: 'Cell Division Question',
    type: 'H5P.TrueFalse',
    question: 'Mitosis results in two genetically identical daughter cells.',
    correct: true,
    feedbackOnCorrect: 'Well done! Mitosis produces identical clones.'
  };
  const tfCompiled = await compiler.compile(tfIR, testDir);
  const tfPath = path.join(testDir, 'truefalse.h5p');
  await packager.packCompiled(tfCompiled, tfPath);
  console.log('✓ TrueFalse compiled & packed');

  // Blanks with syntax checking
  const blanksIR = {
    title: 'Cell Energy Blanks',
    type: 'H5P.Blanks',
    taskDescription: 'Fill in the missing terms in the cellular respiration summary:',
    sentences: [
      {
        text: 'Cellular respiration occurs in the *mitochondria:organelle* and produces *ATP/adenosine triphosphate:energy currency*.',
      }
    ]
  };
  const blanksCompiled = await compiler.compile(blanksIR, testDir);
  const blanksPath = path.join(testDir, 'blanks.h5p');
  await packager.packCompiled(blanksCompiled, blanksPath);
  console.log('✓ Blanks compiled & packed');

  // Dialogcards with image
  const dcIR = {
    title: 'Cell Biology Flashcards',
    type: 'H5P.Dialogcards',
    description: 'Turn the cards to study key cell organelles',
    cards: [
      {
        front: 'What is the powerhouse of the cell?',
        back: 'Mitochondria: responsible for producing ATP via respiration.',
        tip: 'Think about energy'
      },
      {
        front: 'What organelle contains the genetic code?',
        back: 'Nucleus: houses chromosomal DNA.',
        image: svgPath
      }
    ]
  };
  const dcCompiled = await compiler.compile(dcIR, testDir);
  const dcPath = path.join(testDir, 'dialogcards.h5p');
  await packager.packCompiled(dcCompiled, dcPath);
  console.log('✓ Dialogcards compiled & packed');

  // Test 1.3: Composite Course Presentation with 2D Layout & Multi-Modal Media
  console.log('\n--- Testing Tier B Composite CoursePresentation ---');
  const cpIR = {
    title: 'Biology 101: Cell Structure & Function',
    type: 'H5P.CoursePresentation',
    slides: [
      {
        layout: 'title-slide',
        title: 'Cell Biology 101',
        subtitle: 'An interactive exploration of cellular anatomy and energy systems.'
      },
      {
        layout: 'text-left-image-right',
        title: 'The Animal Cell Structure',
        html: '<ul><li><strong>Nucleus</strong>: Genetic command center.</li><li><strong>Cytoplasm</strong>: Fluid matrix suspending organelles.</li><li><strong>Membrane</strong>: Semi-permeable lipid bilayer.</li></ul>',
        image: {
          src: svgPath,
          alt: 'Diagram of Animal Cell'
        }
      },
      {
        layout: 'full-slide-quiz',
        title: 'Check Your Understanding',
        activity: mcIR
      },
      {
        layout: 'full-slide-quiz',
        title: 'Vocabulary Check',
        activity: blanksIR
      }
    ]
  };
  const cpCompiled = await compiler.compile(cpIR, testDir);
  const cpPath = path.join(testDir, 'course_presentation.h5p');
  await packager.packCompiled(cpCompiled, cpPath);
  console.log('✓ CoursePresentation compiled & packed');

  // Test 1.4: Unpack & Round-Trip Validation
  console.log('\n--- Testing Round-Trip Unpack & H5PEditor Validation ---');
  const unpackedDir = path.join(testDir, 'unpacked_cp');
  await packager.unpack(cpPath, unpackedDir);
  console.log('✓ CoursePresentation unpacked successfully');

  // Assert contents of unpacked package
  const unpackedH5pJson = await fs.readJson(path.join(unpackedDir, 'h5p.json'));
  const unpackedContentJson = await fs.readJson(path.join(unpackedDir, 'content', 'content.json'));

  if (!unpackedH5pJson.preloadedDependencies || unpackedH5pJson.preloadedDependencies.length === 0) {
    throw new Error('FAILED: preloadedDependencies is empty!');
  }
  const depNames = unpackedH5pJson.preloadedDependencies.map((d: any) => d.machineName);
  console.log(`✓ Dependencies resolved (${depNames.length} total):`, depNames.slice(0, 6).join(', '), '...');

  if (!depNames.includes('H5P.MultiChoice') || !depNames.includes('H5P.Blanks') || !depNames.includes('H5P.Image')) {
    throw new Error('FAILED: transitive sub-libraries missing in CoursePresentation dependencies!');
  }
  console.log('✓ Transitive sub-library dependencies verified (MultiChoice, Blanks, Image present)');

  // Feed buffer into H5PEditor.uploadPackage() to verify @lumieducation/h5p-server accepts it
  const cpBuffer = await fs.readFile(cpPath);
  const uploadResult = await h5pEditor.uploadPackage(cpBuffer, new User());
  if (!uploadResult || !uploadResult.metadata || !uploadResult.parameters) {
    throw new Error('FAILED: H5PEditor.uploadPackage failed to parse generated package!');
  }
  console.log(`✓ H5PEditor.uploadPackage() accepted package cleanly: "${uploadResult.metadata.title}"`);

  // Test 1.5: HTML & SCORM Export
  console.log('\n--- Testing HTML & SCORM Exports ---');
  const htmlPath = path.join(testDir, 'course_presentation.html');
  await packager.exportHtml(cpCompiled, htmlPath);
  const htmlContent = await fs.readFile(htmlPath, 'utf8');
  if (htmlContent.length < 5000 || !htmlContent.includes('H5PIntegration')) {
    throw new Error('FAILED: Standalone HTML export is empty or invalid!');
  }
  console.log(`✓ Standalone HTML bundle exported (${(htmlContent.length / 1024).toFixed(1)} KB)`);

  const scormPath = path.join(testDir, 'course_presentation_scorm.zip');
  await packager.exportScorm(cpCompiled, scormPath);
  if (!(await fs.pathExists(scormPath)) || (await fs.stat(scormPath)).size < 5000) {
    throw new Error('FAILED: SCORM 1.2 zip export failed or is empty!');
  }
  console.log(`✓ SCORM 1.2 package exported (${((await fs.stat(scormPath)).size / 1024).toFixed(1)} KB)`);

  console.log('\n======================================================');
  console.log('🎉 ALL TEST GATE 1 CHECKS PASSED WITH 100% SUCCESS! 🎉');
  console.log('======================================================\n');
}

runTestGate1().catch((err) => {
  console.error('\n❌ TEST GATE 1 FAILED:', err);
  process.exit(1);
});
