#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import { LibraryRegistry } from './cli/hydrator';
import { IRCompiler } from './cli/ir-compiler';
import { H5PPackager } from './cli/h5p-packager';
import { exportTemplates } from './cli/template-exporter';

function printHelp(): void {
  console.log(`
Lumi Headless Compiler CLI (lumi-cli)
Offline H5P Compiler, IR Hydrator & Packaging Engine

Usage:
  lumi-cli <command> [options]

Commands:
  list                           List installed H5P content types and libraries
    --runnable                   Show only top-level runnable activity types
    --search <term>              Filter libraries by keyword

  schema <library>               Dump schema for a library (e.g. H5P.MultiChoice)
    --ir                         (Default) Output the clean Pedagogical IR schema & sample
    --raw                        Output the raw semantics.json from library folder

  compile <ir-file.json>         Compile Pedagogical IR JSON into an H5P deliverable
    -o, --output <path>          Output file path (e.g. ./quiz.h5p or ./quiz.html)
    -f, --format <format>        Deliverable format: h5p (default), html, scorm
    --no-libs                    Omit library folders from .h5p (for lightweight Moodle packages)

  pack <directory>               Pack a directory containing content/content.json into .h5p
    -o, --output <path>          Output file path
    --lang <lang>                Default language code (e.g. en, ar, fr)

  unpack <file.h5p>              Extract a .h5p package into an editable directory
    -o, --output <dir>           Target directory
    --all                        Extract all library folders in addition to content

  validate <ir-or-dir>           Validate a Pedagogical IR file or H5P directory

  export-templates               Export canonical pre-hydrated template dictionary
    -o, --output <path>          Destination (defaults to assets/h5p-templates.json)

  help                           Display this help message
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help') || args[0] === 'help') {
    printHelp();
    process.exit(0);
  }

  const command = args[0];

  // Resolve library directory (works in dev, built dist, or package execution)
  const defaultLibPath = path.resolve(__dirname, '../../assets/h5p/libraries');
  const fallbackLibPath = path.resolve(process.cwd(), 'assets/h5p/libraries');
  const librariesPath = fs.existsSync(defaultLibPath) ? defaultLibPath : fallbackLibPath;

  const registry = new LibraryRegistry(librariesPath);
  await registry.init();

  switch (command) {
    case 'list': {
      const runnableOnly = args.includes('--runnable');
      const searchIdx = args.indexOf('--search');
      const searchTerm = searchIdx !== -1 && args[searchIdx + 1] ? args[searchIdx + 1].toLowerCase() : '';

      const libs = registry.getAllLibraries().filter((l) => {
        if (runnableOnly && !l.runnable) return false;
        if (searchTerm && !l.machineName.toLowerCase().includes(searchTerm) && !l.title?.toLowerCase().includes(searchTerm)) {
          return false;
        }
        return true;
      });

      console.log(`Found ${libs.length} H5P libraries in ${librariesPath}:\n`);
      for (const lib of libs) {
        const runnableTag = lib.runnable ? ' [Runnable Activity]' : '';
        console.log(`  • ${lib.machineName} v${lib.majorVersion}.${lib.minorVersion}.${lib.patchVersion || 0} - "${lib.title}"${runnableTag}`);
      }
      break;
    }

    case 'schema': {
      const libName = args[1];
      if (!libName) {
        console.error('Error: Please specify a library name (e.g. lumi-cli schema H5P.MultiChoice)');
        process.exit(1);
      }

      const libDesc = registry.findByUbername(libName);
      if (!libDesc) {
        console.error(`Error: Library "${libName}" not found in local repository.`);
        process.exit(1);
      }

      if (args.includes('--raw')) {
        const rawSem = await registry.getSemantics(libDesc);
        console.log(JSON.stringify(rawSem, null, 2));
      } else {
        // Output clean IR schema guidance
        console.log(JSON.stringify({
          library: `${libDesc.machineName} ${libDesc.majorVersion}.${libDesc.minorVersion}`,
          title: libDesc.title,
          description: `Pedagogical IR structure for ${libDesc.title}`,
          sampleIR: {
            title: `Sample ${libDesc.title}`,
            type: libDesc.machineName,
            language: 'en'
          }
        }, null, 2));
      }
      break;
    }

    case 'compile': {
      const inputFile = args[1];
      if (!inputFile) {
        console.error('Error: Please specify the input Pedagogical IR JSON file.');
        process.exit(1);
      }

      const outIdx = args.indexOf('-o') !== -1 ? args.indexOf('-o') : args.indexOf('--output');
      const outputPath = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : path.basename(inputFile, '.json') + '.h5p';

      const fmtIdx = args.indexOf('-f') !== -1 ? args.indexOf('-f') : args.indexOf('--format');
      const format = (fmtIdx !== -1 && args[fmtIdx + 1] ? args[fmtIdx + 1] : 'h5p').toLowerCase();

      const irData = await fs.readJson(path.resolve(inputFile));
      const compiler = new IRCompiler(registry);
      const compiled = await compiler.compile(irData, path.dirname(path.resolve(inputFile)));

      const packager = new H5PPackager(registry);
      let finalPath: string;

      if (format === 'html') {
        finalPath = await packager.exportHtml(compiled, outputPath);
      } else if (format === 'scorm') {
        finalPath = await packager.exportScorm(compiled, outputPath);
      } else {
        const includeLibraries = !args.includes('--no-libs');
        finalPath = await packager.packCompiled(compiled, outputPath, { includeLibraries });
      }

      console.log(`[SUCCESS] Compiled "${irData.title}" into ${format.toUpperCase()} package:\n  ${finalPath}`);
      break;
    }

    case 'pack': {
      const inputDir = args[1];
      if (!inputDir) {
        console.error('Error: Please specify the input activity directory.');
        process.exit(1);
      }

      const outIdx = args.indexOf('-o') !== -1 ? args.indexOf('-o') : args.indexOf('--output');
      const outputPath = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : `${path.basename(path.resolve(inputDir))}.h5p`;

      const packager = new H5PPackager(registry);
      const finalPath = await packager.packDirectory(inputDir, outputPath);
      console.log(`[SUCCESS] Packed directory into H5P package:\n  ${finalPath}`);
      break;
    }

    case 'unpack': {
      const inputFile = args[1];
      if (!inputFile) {
        console.error('Error: Please specify the .h5p package file.');
        process.exit(1);
      }

      const outIdx = args.indexOf('-o') !== -1 ? args.indexOf('-o') : args.indexOf('--output');
      const outputDir = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : path.basename(inputFile, '.h5p');

      const packager = new H5PPackager(registry);
      const extractLibraries = args.includes('--all');
      const finalPath = await packager.unpack(inputFile, outputDir, { extractLibraries });
      console.log(`[SUCCESS] Extracted package into:\n  ${finalPath}`);
      break;
    }

    case 'validate': {
      const target = args[1];
      if (!target) {
        console.error('Error: Please specify a file or directory to validate.');
        process.exit(1);
      }

      const resolved = path.resolve(target);
      const stat = await fs.stat(resolved);

      if (stat.isDirectory()) {
        const contentJson = path.join(resolved, 'content', 'content.json');
        if (!(await fs.pathExists(contentJson))) {
          console.error(`[INVALID] Missing "content/content.json" in ${resolved}`);
          process.exit(1);
        }
        console.log(`[VALID] Directory structure conforms to H5P specification: ${resolved}`);
      } else if (target.endsWith('.h5p')) {
        const yauzl = require('yauzl-promise');
        const zip = await yauzl.open(resolved);
        let hasH5pJson = false;
        let hasContentJson = false;
        let entry = await zip.readEntry();
        while (entry) {
          if (entry.fileName === 'h5p.json') hasH5pJson = true;
          if (entry.fileName === 'content/content.json') hasContentJson = true;
          entry = await zip.readEntry();
        }
        await zip.close();
        if (!hasH5pJson || !hasContentJson) {
          console.error(`[INVALID] .h5p archive missing required h5p.json or content/content.json`);
          process.exit(1);
        }
        console.log(`[VALID] .h5p archive is structurally valid and complete: ${resolved}`);
      } else {
        const ir = await fs.readJson(resolved);
        if (!ir.type) {
          console.error(`[INVALID] IR JSON is missing required "type" field.`);
          process.exit(1);
        }
        const lib = registry.findByUbername(ir.type);
        if (!lib) {
          console.error(`[INVALID] Target library "${ir.type}" not found.`);
          process.exit(1);
        }
        console.log(`[VALID] Pedagogical IR is valid for ${lib.machineName} (${lib.title}).`);
      }
      break;
    }

    case 'export-templates': {
      const outIdx = args.indexOf('-o') !== -1 ? args.indexOf('-o') : args.indexOf('--output');
      const outputPath = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : path.resolve(__dirname, '../../assets/h5p-templates.json');

      const finalPath = await exportTemplates(registry, outputPath);
      console.log(`[SUCCESS] Exported canonical template dictionary:\n  ${finalPath}`);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('[CLI ERROR]', err);
  process.exit(1);
});
