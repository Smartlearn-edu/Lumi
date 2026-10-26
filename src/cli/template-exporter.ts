import fs from 'fs-extra';
import path from 'path';
import { LibraryRegistry, hydrateSemantics } from './hydrator';

export async function exportTemplates(
  registry: LibraryRegistry,
  outputPath: string
): Promise<string> {
  const targetLibraries = [
    'H5P.MultiChoice',
    'H5P.TrueFalse',
    'H5P.Blanks',
    'H5P.DragText',
    'H5P.Dialogcards',
    'H5P.Flashcards',
    'H5P.Summary',
    'H5P.SingleChoiceSet',
    'H5P.CoursePresentation',
    'H5P.Column',
    'H5P.InteractiveBook'
  ];

  const templates: Record<string, any> = {};

  for (const machineName of targetLibraries) {
    const libDesc = registry.findLibrary(machineName);
    if (!libDesc) continue;

    const semantics = await registry.getSemantics(libDesc);
    const translations = await registry.getLanguageTranslations(libDesc, 'en');
    const defaultParams = hydrateSemantics(semantics, {}, translations);

    templates[machineName] = {
      machineName: libDesc.machineName,
      majorVersion: libDesc.majorVersion,
      minorVersion: libDesc.minorVersion,
      ubername: `${libDesc.machineName} ${libDesc.majorVersion}.${libDesc.minorVersion}`,
      title: libDesc.title,
      defaultParams,
      preloadedDependencies: registry.resolveAllDependencies(libDesc)
    };
  }

  const resolvedOutput = path.resolve(outputPath);
  await fs.mkdirp(path.dirname(resolvedOutput));
  await fs.writeJson(resolvedOutput, templates, { spaces: 2 });
  return resolvedOutput;
}
