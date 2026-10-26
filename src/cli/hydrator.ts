import fs from 'fs-extra';
import path from 'path';

export interface ILibraryDescriptor {
  machineName: string;
  majorVersion: number;
  minorVersion: number;
  patchVersion?: number;
  runnable?: number;
  title?: string;
  preloadedDependencies?: Array<{
    machineName: string;
    majorVersion: number;
    minorVersion: number;
  }>;
  editorDependencies?: Array<{
    machineName: string;
    majorVersion: number;
    minorVersion: number;
  }>;
  dirName: string;
  fullPath: string;
}

export interface IDependency {
  machineName: string;
  majorVersion: number;
  minorVersion: number;
}

export class LibraryRegistry {
  private librariesPath: string;
  private libraries: Map<string, ILibraryDescriptor[]> = new Map();
  private dirMap: Map<string, ILibraryDescriptor> = new Map();

  constructor(librariesPath?: string) {
    this.librariesPath =
      librariesPath ||
      path.resolve(__dirname, '../../../assets/h5p/libraries') ||
      path.resolve(process.cwd(), 'assets/h5p/libraries');
  }

  public async init(): Promise<void> {
    if (!fs.existsSync(this.librariesPath)) {
      // Fallback check for build directory vs root directory
      const altPath = path.resolve(process.cwd(), 'assets/h5p/libraries');
      if (fs.existsSync(altPath)) {
        this.librariesPath = altPath;
      }
    }

    const dirs = await fs.readdir(this.librariesPath);
    for (const dir of dirs) {
      const fullPath = path.join(this.librariesPath, dir);
      const libJsonPath = path.join(fullPath, 'library.json');
      if (fs.existsSync(libJsonPath)) {
        try {
          const libJson = await fs.readJson(libJsonPath);
          const descriptor: ILibraryDescriptor = {
            machineName: libJson.machineName,
            majorVersion: libJson.majorVersion,
            minorVersion: libJson.minorVersion,
            patchVersion: libJson.patchVersion || 0,
            runnable: libJson.runnable || 0,
            title: libJson.title || libJson.machineName,
            preloadedDependencies: libJson.preloadedDependencies || [],
            editorDependencies: libJson.editorDependencies || [],
            dirName: dir,
            fullPath
          };

          this.dirMap.set(dir, descriptor);
          const existing = this.libraries.get(descriptor.machineName) || [];
          existing.push(descriptor);
          // Sort descending by major then minor then patch
          existing.sort((a, b) => {
            if (b.majorVersion !== a.majorVersion) return b.majorVersion - a.majorVersion;
            if (b.minorVersion !== a.minorVersion) return b.minorVersion - a.minorVersion;
            return (b.patchVersion || 0) - (a.patchVersion || 0);
          });
          this.libraries.set(descriptor.machineName, existing);
        } catch {
          // Ignore invalid library directories silently
        }
      }
    }
  }

  public getLibrariesPath(): string {
    return this.librariesPath;
  }

  public getAllLibraries(): ILibraryDescriptor[] {
    const all: ILibraryDescriptor[] = [];
    for (const list of this.libraries.values()) {
      if (list.length > 0) all.push(list[0]);
    }
    return all.sort((a, b) => a.machineName.localeCompare(b.machineName));
  }

  public findLibrary(machineName: string, majorVersion?: number, minorVersion?: number): ILibraryDescriptor | undefined {
    const list = this.libraries.get(machineName);
    if (!list || list.length === 0) return undefined;
    if (majorVersion === undefined) return list[0];
    return list.find((lib) => lib.majorVersion === majorVersion && (minorVersion === undefined || lib.minorVersion === minorVersion)) || list[0];
  }

  public findByUbername(ubername: string): ILibraryDescriptor | undefined {
    // Ubername format: "H5P.MultiChoice 1.16" or "H5P.MultiChoice-1.16"
    const match = ubername.trim().match(/^([^\s-]+)[-\s]+([0-9]+)\.([0-9]+)/);
    if (!match) return this.findLibrary(ubername.trim());
    return this.findLibrary(match[1], parseInt(match[2], 10), parseInt(match[3], 10));
  }

  public formatUbername(lib: ILibraryDescriptor): string {
    return `${lib.machineName} ${lib.majorVersion}.${lib.minorVersion}`;
  }

  public formatFolder(lib: ILibraryDescriptor): string {
    return `${lib.machineName}-${lib.majorVersion}.${lib.minorVersion}`;
  }

  public async getSemantics(lib: ILibraryDescriptor): Promise<any[]> {
    const semPath = path.join(lib.fullPath, 'semantics.json');
    if (await fs.pathExists(semPath)) {
      return fs.readJson(semPath);
    }
    return [];
  }

  public async getLanguageTranslations(lib: ILibraryDescriptor, lang: string = 'en'): Promise<Record<string, any>> {
    const langDir = path.join(lib.fullPath, 'language');
    if (!fs.existsSync(langDir)) return {};
    
    // Try specified language, then english, then first available
    const targets = [`${lang}.json`, `${lang.toLowerCase()}.json`, 'en.json'];
    for (const target of targets) {
      const p = path.join(langDir, target);
      if (await fs.pathExists(p)) {
        try {
          return await fs.readJson(p);
        } catch {
          // continue
        }
      }
    }
    return {};
  }

  /**
   * Recursively resolves all transitive preloadedDependencies for a root library and any sub-libraries found in content.
   */
  public resolveAllDependencies(
    rootLib: ILibraryDescriptor,
    dynamicLibraries: string[] = []
  ): IDependency[] {
    const resolved = new Map<string, IDependency>();

    const addDependency = (machineName: string, major: number, minor: number) => {
      const key = `${machineName} ${major}.${minor}`;
      if (!resolved.has(key)) {
        resolved.set(key, { machineName, majorVersion: major, minorVersion: minor });
        const libDesc = this.findLibrary(machineName, major, minor);
        if (libDesc) {
          for (const dep of libDesc.preloadedDependencies || []) {
            addDependency(dep.machineName, dep.majorVersion, dep.minorVersion);
          }
        }
      }
    };

    // 1. Add root library itself
    addDependency(rootLib.machineName, rootLib.majorVersion, rootLib.minorVersion);

    // 2. Add root static dependencies
    for (const dep of rootLib.preloadedDependencies || []) {
      addDependency(dep.machineName, dep.majorVersion, dep.minorVersion);
    }

    // 3. Add dynamic/embedded libraries (e.g. from CoursePresentation slides or Column blocks)
    for (const dynUber of dynamicLibraries) {
      const dynLib = this.findByUbername(dynUber);
      if (dynLib) {
        addDependency(dynLib.machineName, dynLib.majorVersion, dynLib.minorVersion);
      }
    }

    return Array.from(resolved.values());
  }
}

/**
 * Recursively scans a content.json object and extracts all referenced "library" strings.
 */
export function extractEmbeddedLibraries(obj: any): string[] {
  const libraries = new Set<string>();
  const scan = (item: any) => {
    if (!item || typeof item !== 'object') return;
    if (typeof item.library === 'string' && item.library.length > 0) {
      libraries.add(item.library);
    }
    if (Array.isArray(item)) {
      for (const el of item) scan(el);
    } else {
      for (const val of Object.values(item)) scan(val);
    }
  };
  scan(obj);
  return Array.from(libraries);
}

/**
 * Hydrates a parameters object against a library's semantics.json schema,
 * injecting default values for missing fields and UI strings.
 */
export function hydrateSemantics(
  semanticsList: any[],
  params: any,
  translations: Record<string, any> = {}
): any {
  if (!params || typeof params !== 'object') {
    params = {};
  }

  for (const field of semanticsList) {
    const name = field.name;
    if (!name) continue;

    if (params[name] === undefined) {
      if (field.default !== undefined) {
        params[name] = field.default;
      } else if (field.type === 'group' && !field.optional) {
        params[name] = {};
      }
    }

    // Check language translation overrides for common/label fields
    if (translations[name] !== undefined && typeof params[name] === 'string' && params[name] === field.default) {
      params[name] = translations[name];
    }

    if (field.type === 'group' && params[name] && typeof params[name] === 'object' && Array.isArray(field.fields)) {
      const groupTrans = translations[name] && typeof translations[name] === 'object' ? translations[name] : {};
      hydrateSemantics(field.fields, params[name], groupTrans);
    } else if (field.type === 'list' && Array.isArray(params[name]) && field.field && field.field.type === 'group' && Array.isArray(field.field.fields)) {
      for (const item of params[name]) {
        if (item && typeof item === 'object') {
          hydrateSemantics(field.field.fields, item, translations);
        }
      }
    }
  }

  return params;
}
