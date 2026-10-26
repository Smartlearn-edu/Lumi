import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import * as H5P from '@lumieducation/h5p-server';
import User from '../../src/models/User';

async function runTestGate2() {
  console.log('=== RUNNING TEST GATE 2: AGENT SKILL WORKFLOW SIMULATION ===\n');

  const testDir = path.resolve(process.cwd(), 'test-output-skill');
  await fs.emptyDir(testDir);

  // 1. Step 1: Input Educational Document
  const lessonDoc = path.join(testDir, 'circulatory_system.md');
  await fs.writeFile(
    lessonDoc,
    `# The Human Circulatory System
The human heart is a muscular organ with four chambers: two atria and two ventricles.
The right side of the heart receives deoxygenated blood from the body and pumps it to the lungs.
The left side receives oxygenated blood from the lungs and pumps it to the rest of the body.
Key vessels include the Aorta, Vena Cava, Pulmonary Artery, and Pulmonary Veins.`,
    'utf8'
  );
  console.log('✓ Educational source document created: circulatory_system.md');

  // 2. Step 2: Media Generation - Custom SVG Anatomical Diagram
  const svgDir = path.join(testDir, 'images');
  await fs.mkdirp(svgDir);
  const svgPath = path.join(svgDir, 'heart_chambers.svg');
  await fs.writeFile(
    svgPath,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
      <rect width="800" height="600" fill="#fff5f5" rx="16"/>
      <rect x="150" y="100" width="220" height="180" fill="#3182ce" rx="12"/>
      <text x="260" y="195" font-family="Arial" font-size="20" text-anchor="middle" fill="#ffffff">Right Atrium</text>
      <rect x="430" y="100" width="220" height="180" fill="#e53e3e" rx="12"/>
      <text x="540" y="195" font-family="Arial" font-size="20" text-anchor="middle" fill="#ffffff">Left Atrium</text>
      <rect x="150" y="320" width="220" height="180" fill="#2b6cb0" rx="12"/>
      <text x="260" y="415" font-family="Arial" font-size="20" text-anchor="middle" fill="#ffffff">Right Ventricle</text>
      <rect x="430" y="320" width="220" height="180" fill="#c53030" rx="12"/>
      <text x="540" y="415" font-family="Arial" font-size="20" text-anchor="middle" fill="#ffffff">Left Ventricle</text>
      <text x="400" y="560" font-family="Arial" font-size="22" font-weight="bold" text-anchor="middle" fill="#2d3748">Four Chambers of the Human Heart</text>
    </svg>`,
    'utf8'
  );
  console.log('✓ Custom SVG anatomical diagram generated: images/heart_chambers.svg');

  // 3. Step 3: Pedagogical IR Authoring
  const irPath = path.join(testDir, 'heart_lesson_ir.json');
  const irData = {
    title: 'Interactive Anatomy: The Human Heart',
    language: 'en',
    type: 'H5P.CoursePresentation',
    slides: [
      {
        layout: 'title-slide',
        title: 'The Human Circulatory System',
        subtitle: 'An interactive lesson on cardiac anatomy and systemic circulation'
      },
      {
        layout: 'text-left-image-right',
        title: 'Four Cardiac Chambers',
        html: '<ul><li><strong>Right Atrium</strong>: Receives deoxygenated blood via the vena cava.</li><li><strong>Right Ventricle</strong>: Pumps blood to lungs via pulmonary arteries.</li><li><strong>Left Atrium</strong>: Receives oxygen-rich blood from lungs.</li><li><strong>Left Ventricle</strong>: Pumps oxygenated blood to the body through the aorta.</li></ul>',
        image: {
          src: 'images/heart_chambers.svg',
          alt: 'Diagram showing four chambers of the heart'
        }
      },
      {
        layout: 'full-slide-quiz',
        title: 'Comprehension Check: Primary Artery',
        activity: {
          type: 'H5P.MultiChoice',
          question: 'Which major vessel carries oxygenated blood from the left ventricle to the systemic circulation?',
          answers: [
            { text: 'Aorta', correct: true, feedback: 'Correct! The aorta is the largest systemic artery.' },
            { text: 'Pulmonary Artery', correct: false, feedback: 'The pulmonary artery carries deoxygenated blood to the lungs.' },
            { text: 'Superior Vena Cava', correct: false }
          ],
          singleAnswer: true
        }
      },
      {
        layout: 'full-slide-quiz',
        title: 'Vocabulary Check: Blood Flow',
        activity: {
          type: 'H5P.Blanks',
          taskDescription: 'Fill in the blanks to complete the blood pathway:',
          sentences: [
            {
              text: 'Blood returns from the body via the {{0}} and enters the {{1}}.',
              blanks: [
                { accepted: ['vena cava', 'inferior vena cava', 'superior vena cava'], hint: 'Largest vein' },
                { accepted: ['right atrium', 'right atria'], hint: 'Upper right chamber' }
              ]
            }
          ]
        }
      }
    ]
  };

  await fs.writeJson(irPath, irData, { spaces: 2 });
  console.log('✓ Pedagogical IR generated: heart_lesson_ir.json');

  // 4. Step 4: Run build-h5p.sh script to compile
  const h5pOutput = path.join(testDir, 'heart_lesson.h5p');
  const htmlOutput = path.join(testDir, 'heart_lesson.html');
  const scriptPath = path.resolve(process.cwd(), 'skills/h5p-ai-creator/scripts/build-h5p.sh');

  console.log('\n--- Executing build-h5p.sh compilation ---');
  execSync(`"${scriptPath}" compile "${irPath}" -o "${h5pOutput}"`, { stdio: 'inherit' });
  execSync(`"${scriptPath}" compile "${irPath}" -o "${htmlOutput}" -f html`, { stdio: 'inherit' });
  execSync(`"${scriptPath}" validate "${h5pOutput}"`, { stdio: 'inherit' });

  // 5. Step 5: Assert outputs and verify with @lumieducation/h5p-server
  if (!(await fs.pathExists(h5pOutput)) || (await fs.stat(h5pOutput)).size < 10000) {
    throw new Error('FAILED: Generated .h5p package is missing or too small!');
  }
  console.log(`\n✓ Generated .h5p file verified: ${((await fs.stat(h5pOutput)).size / 1024).toFixed(1)} KB`);

  if (!(await fs.pathExists(htmlOutput)) || (await fs.stat(htmlOutput)).size < 10000) {
    throw new Error('FAILED: Generated standalone HTML is missing or too small!');
  }
  console.log(`✓ Generated standalone HTML verified: ${((await fs.stat(htmlOutput)).size / 1024).toFixed(1)} KB`);

  // Verify package validation inside H5PEditor
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

  const buffer = await fs.readFile(h5pOutput);
  const uploadResult = await h5pEditor.uploadPackage(buffer, new User());
  if (!uploadResult || uploadResult.metadata.title !== 'Interactive Anatomy: The Human Heart') {
    throw new Error('FAILED: Package metadata title mismatch during H5PEditor verification!');
  }

  console.log(`✓ Full round-trip validation confirmed: "${uploadResult.metadata.title}" ready for Moodle/Lumi!`);

  console.log('\n======================================================');
  console.log('🎉 ALL TEST GATE 2 CHECKS PASSED WITH 100% SUCCESS! 🎉');
  console.log('======================================================\n');
}

runTestGate2().catch((err) => {
  console.error('\n❌ TEST GATE 2 FAILED:', err);
  process.exit(1);
});
