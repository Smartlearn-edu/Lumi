import fs from 'fs-extra';
import path from 'path';
import yazl from 'yazl';
import yauzl from 'yauzl-promise';
import { pipeline } from 'stream/promises';
import { withDir } from 'tmp-promise';
import scopackager from 'simple-scorm-packager';
import HtmlExporter from '@lumieducation/h5p-html-exporter';
import * as H5P from '@lumieducation/h5p-server';

import { LibraryRegistry } from './hydrator';
import { CompiledH5PPackage } from './ir-compiler';
import simpleTemplate from '../ops/templates/simple';
import scormTemplate from '../ops/templates/scorm';
import User from '../models/User';

export interface IPackOptions {
  outputPath: string;
  format?: 'h5p' | 'html' | 'scorm';
  includeLibraries?: boolean;
}

export class H5PPackager {
  private registry: LibraryRegistry;

  constructor(registry: LibraryRegistry) {
    this.registry = registry;
  }

  /**
   * Directly packages a compiled IR package into a standard .h5p file.
   */
  public async packCompiled(
    compiled: CompiledH5PPackage,
    outputPath: string,
    options: { includeLibraries?: boolean } = {}
  ): Promise<string> {
    const zip = new yazl.ZipFile();
    const resolvedOutput = path.resolve(outputPath);
    await fs.mkdirp(path.dirname(resolvedOutput));

    // 1. Add h5p.json
    const h5pJsonBuffer = Buffer.from(JSON.stringify(compiled.h5pJson, null, 2), 'utf8');
    zip.addBuffer(h5pJsonBuffer, 'h5p.json');

    // 2. Add content/content.json
    const contentJsonBuffer = Buffer.from(JSON.stringify(compiled.contentJson, null, 2), 'utf8');
    zip.addBuffer(contentJsonBuffer, 'content/content.json');

    // 3. Add referenced media files
    for (const media of compiled.mediaFiles) {
      if (await fs.pathExists(media.sourcePath)) {
        zip.addFile(media.sourcePath, `content/${media.targetPath.replace(/^\/+/, '')}`);
      }
    }

    // 4. Add library folders (unless explicitly excluded)
    if (options.includeLibraries !== false) {
      for (const dep of compiled.h5pJson.preloadedDependencies || []) {
        const libDesc = this.registry.findLibrary(dep.machineName, dep.majorVersion, dep.minorVersion);
        if (libDesc && (await fs.pathExists(libDesc.fullPath))) {
          await this.addDirectoryToZip(zip, libDesc.fullPath, libDesc.dirName);
        }
      }
    }

    zip.end();

    const outputStream = fs.createWriteStream(resolvedOutput);
    await pipeline(zip.outputStream, outputStream);

    return resolvedOutput;
  }

  /**
   * Packs an existing folder containing content/content.json and optional h5p.json into .h5p.
   */
  public async packDirectory(
    sourceDir: string,
    outputPath: string,
    options: { hydrate?: boolean; lang?: string } = {}
  ): Promise<string> {
    const resolvedSource = path.resolve(sourceDir);
    const resolvedOutput = path.resolve(outputPath);
    const contentJsonPath = path.join(resolvedSource, 'content', 'content.json');

    if (!(await fs.pathExists(contentJsonPath))) {
      throw new Error(`Invalid H5P directory: missing "content/content.json" at ${resolvedSource}`);
    }

    const contentJson = await fs.readJson(contentJsonPath);
    let h5pJson: any;
    const h5pJsonPath = path.join(resolvedSource, 'h5p.json');

    if (await fs.pathExists(h5pJsonPath)) {
      h5pJson = await fs.readJson(h5pJsonPath);
    } else {
      h5pJson = {
        title: path.basename(resolvedSource),
        language: options.lang || 'en',
        mainLibrary: 'H5P.MultiChoice',
        embedTypes: ['iframe'],
        license: 'U',
        preloadedDependencies: []
      };
    }

    // Resolve dependencies
    const mainLib = this.registry.findByUbername(h5pJson.mainLibrary);
    if (mainLib) {
      const dynamicLibs = this.collectEmbeddedLibraries(contentJson);
      h5pJson.preloadedDependencies = this.registry.resolveAllDependencies(mainLib, dynamicLibs);
    }

    const zip = new yazl.ZipFile();
    await fs.mkdirp(path.dirname(resolvedOutput));

    zip.addBuffer(Buffer.from(JSON.stringify(h5pJson, null, 2), 'utf8'), 'h5p.json');
    zip.addBuffer(Buffer.from(JSON.stringify(contentJson, null, 2), 'utf8'), 'content/content.json');

    const contentDir = path.join(resolvedSource, 'content');
    const contentItems = await fs.readdir(contentDir);
    for (const item of contentItems) {
      if (item !== 'content.json') {
        const itemPath = path.join(contentDir, item);
        const stat = await fs.stat(itemPath);
        if (stat.isDirectory()) {
          await this.addDirectoryToZip(zip, itemPath, `content/${item}`);
        } else {
          zip.addFile(itemPath, `content/${item}`);
        }
      }
    }

    for (const dep of h5pJson.preloadedDependencies || []) {
      const libDesc = this.registry.findLibrary(dep.machineName, dep.majorVersion, dep.minorVersion);
      if (libDesc && (await fs.pathExists(libDesc.fullPath))) {
        await this.addDirectoryToZip(zip, libDesc.fullPath, libDesc.dirName);
      }
    }

    zip.end();
    const outputStream = fs.createWriteStream(resolvedOutput);
    await pipeline(zip.outputStream, outputStream);

    return resolvedOutput;
  }

  /**
   * Compiles to a standalone single-file HTML bundle.
   */
  public async exportHtml(compiled: CompiledH5PPackage, outputPath: string): Promise<string> {
    const resolvedOutput = path.resolve(outputPath);
    await fs.mkdirp(path.dirname(resolvedOutput));

    return withDir(
      async ({ path: tmpDir }) => {
        // Temporarily write content and library
        const contentId = 'temp_export';
        const contentStorageDir = path.join(tmpDir, 'content');
        const libStorage = new H5P.fsImplementations.FileLibraryStorage(this.registry.getLibrariesPath());
        const contentStorage = new H5P.fsImplementations.FileContentStorage(contentStorageDir);
        await contentStorage.addContent(compiled.h5pJson, compiled.contentJson, new User(), contentId);

        for (const media of compiled.mediaFiles) {
          const dest = path.join(contentStorageDir, contentId, media.targetPath);
          await fs.mkdirp(path.dirname(dest));
          await fs.copy(media.sourcePath, dest);
        }

        const config = new H5P.H5PConfig();
        config.baseUrl = '/h5p';
        config.coreApiVersion = { major: 1, minor: 27 };
        config.h5pVersion = '1.27';

        const rootDir = path.resolve(__dirname, '../../../');
        const corePath = path.join(rootDir, 'assets/h5p/core');
        const editorPath = path.join(rootDir, 'assets/h5p/editor');

        const htmlExporter = new HtmlExporter(
          libStorage,
          contentStorage,
          config,
          corePath,
          editorPath,
          simpleTemplate(0, 0, undefined, undefined),
          (k) => k
        );

        const html = await htmlExporter.createSingleBundle(contentId, new User(), {
          language: compiled.h5pJson.language || 'en',
          showEmbedButton: false,
          showFrame: false,
          showLicenseButton: false
        });

        await fs.writeFile(resolvedOutput, html, 'utf8');
        return resolvedOutput;
      },
      { keep: false, unsafeCleanup: true }
    );
  }

  /**
   * Compiles to a SCORM 1.2 zip package.
   */
  public async exportScorm(
    compiled: CompiledH5PPackage,
    outputPath: string,
    options: { masteryScore?: number } = {}
  ): Promise<string> {
    const resolvedOutput = path.resolve(outputPath);
    await fs.mkdirp(path.dirname(resolvedOutput));

    return withDir(
      async ({ path: tmpDir }) => {
        const rootDir = path.resolve(__dirname, '../../../');
        const scormClientDir = path.join(rootDir, 'assets/scorm-client');

        await fs.copy(path.join(scormClientDir, 'h5p-adaptor.js'), path.join(tmpDir, 'h5p-adaptor.js'));
        await fs.copy(path.join(scormClientDir, 'SCORM_API_wrapper.js'), path.join(tmpDir, 'SCORM_API_wrapper.js'));

        const contentId = 'scorm_content';
        const contentStorageDir = path.join(tmpDir, 'content_store');
        const libStorage = new H5P.fsImplementations.FileLibraryStorage(this.registry.getLibrariesPath());
        const contentStorage = new H5P.fsImplementations.FileContentStorage(contentStorageDir);
        await contentStorage.addContent(compiled.h5pJson, compiled.contentJson, new User(), contentId);

        for (const media of compiled.mediaFiles) {
          const dest = path.join(contentStorageDir, contentId, media.targetPath);
          await fs.mkdirp(path.dirname(dest));
          await fs.copy(media.sourcePath, dest);
        }

        const config = new H5P.H5PConfig();
        config.baseUrl = '/h5p';
        config.coreApiVersion = { major: 1, minor: 27 };
        config.h5pVersion = '1.27';

        const corePath = path.join(rootDir, 'assets/h5p/core');
        const editorPath = path.join(rootDir, 'assets/h5p/editor');

        const htmlExporter = new HtmlExporter(
          libStorage,
          contentStorage,
          config,
          corePath,
          editorPath,
          scormTemplate(0, 0, undefined, undefined),
          (k) => k
        );

        const html = await htmlExporter.createSingleBundle(contentId, new User(), {
          language: compiled.h5pJson.language || 'en',
          showEmbedButton: false,
          showFrame: false,
          showLicenseButton: false
        });

        await fs.writeFile(path.join(tmpDir, 'index.html'), html, 'utf8');

        // Build SCORM zip using scopackager
        await new Promise<void>((resolve, reject) => {
          const opt = {
            version: '1.2',
            organization: 'Lumi H5P Compiler',
            title: compiled.h5pJson.title || 'H5P Activity',
            language: compiled.h5pJson.language || 'en',
            identifier: 'H5P_01',
            masteryScore: options.masteryScore || 80,
            startingPage: 'index.html',
            source: tmpDir,
            package: {
              version: '1.0.0',
              zip: true,
              outputFolder: path.dirname(resolvedOutput),
              name: path.basename(resolvedOutput, '.zip'),
              date: new Date().toISOString().slice(0, 10)
            }
          };
          scopackager(opt, () => {
            resolve();
          });
        });

        // scopackager strips special characters and appends version and date to the zip filename.
        // We find the generated zip and move it to the requested exact resolvedOutput path.
        const cleanTarget = path.basename(resolvedOutput, '.zip').replace(/[^a-zA-Z\d]/g, '').toLowerCase();
        const generatedFiles = await fs.readdir(path.dirname(resolvedOutput));
        const matched = generatedFiles.find((f) => {
          const cleanF = f.replace(/[^a-zA-Z\d]/g, '').toLowerCase();
          return cleanF.startsWith(cleanTarget) && f.endsWith('.zip') && path.join(path.dirname(resolvedOutput), f) !== resolvedOutput;
        });
        if (matched) {
          await fs.move(path.join(path.dirname(resolvedOutput), matched), resolvedOutput, { overwrite: true });
        }

        return resolvedOutput;
      },
      { keep: false, unsafeCleanup: true }
    );
  }

  /**
   * Extracts an existing .h5p archive into an editable directory.
   */
  public async unpack(
    h5pFilePath: string,
    outputDir: string,
    options: { extractLibraries?: boolean } = {}
  ): Promise<string> {
    const resolvedFile = path.resolve(h5pFilePath);
    const resolvedDir = path.resolve(outputDir);
    await fs.mkdirp(resolvedDir);

    const zipFile = await yauzl.open(resolvedFile);
    try {
      let entry = await zipFile.readEntry();
      while (entry) {
        const isDir = entry.fileName.endsWith('/');
        const isLibraryFolder = !entry.fileName.startsWith('content/') && entry.fileName !== 'h5p.json';

        if (!isLibraryFolder || options.extractLibraries !== false) {
          const destPath = path.join(resolvedDir, entry.fileName);
          if (isDir) {
            await fs.mkdirp(destPath);
          } else {
            await fs.mkdirp(path.dirname(destPath));
            const readStream = await entry.openReadStream();
            const writeStream = fs.createWriteStream(destPath);
            await pipeline(readStream, writeStream);
          }
        }
        entry = await zipFile.readEntry();
      }
    } finally {
      await zipFile.close();
    }

    return resolvedDir;
  }

  private async addDirectoryToZip(zip: yazl.ZipFile, dirPath: string, zipPrefix: string): Promise<void> {
    const files = await fs.readdir(dirPath);
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const zipPath = `${zipPrefix}/${file}`;
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        await this.addDirectoryToZip(zip, fullPath, zipPath);
      } else {
        zip.addFile(fullPath, zipPath);
      }
    }
  }

  private collectEmbeddedLibraries(obj: any): string[] {
    const libs = new Set<string>();
    const scan = (item: any) => {
      if (!item || typeof item !== 'object') return;
      if (typeof item.library === 'string' && item.library.length > 0) libs.add(item.library);
      if (Array.isArray(item)) item.forEach(scan);
      else Object.values(item).forEach(scan);
    };
    scan(obj);
    return Array.from(libs);
  }
}
