import path from 'path';
import {
  LibraryRegistry,
  ILibraryDescriptor,
  hydrateSemantics,
  extractEmbeddedLibraries
} from './hydrator';
import {
  inspectMediaFile,
  wrapAsH5PImage,
  generateUUID,
  MediaInfo
} from './media-inspector';
import { buildSlideElements, ISlideContentInput } from './slide-layout';

export interface PedagogicalIR {
  title: string;
  language?: string;
  type: string; // e.g. "H5P.MultiChoice", "H5P.CoursePresentation", "H5P.InteractiveBook", etc.
  [key: string]: any;
}

export interface CompiledH5PPackage {
  mainLibrary: ILibraryDescriptor;
  h5pJson: any;
  contentJson: any;
  mediaFiles: Array<{ sourcePath: string; targetPath: string }>;
}

export class IRCompiler {
  private registry: LibraryRegistry;

  constructor(registry: LibraryRegistry) {
    this.registry = registry;
  }

  public async compile(
    ir: PedagogicalIR,
    baseDir: string = process.cwd()
  ): Promise<CompiledH5PPackage> {
    const lang = ir.language || 'en';
    const mainLibDesc = this.registry.findByUbername(ir.type);
    if (!mainLibDesc) {
      throw new Error(`Unsupported or missing main library: "${ir.type}". Run 'lumi-cli list' to see available libraries.`);
    }

    const mediaFiles: Array<{ sourcePath: string; targetPath: string }> = [];
    const mediaCollector = async (relOrAbsPath: string, targetSubdir: string = 'images'): Promise<MediaInfo> => {
      const absPath = path.isAbsolute(relOrAbsPath) ? relOrAbsPath : path.resolve(baseDir, relOrAbsPath);
      const inspected = await inspectMediaFile(absPath, targetSubdir);
      mediaFiles.push({
        sourcePath: absPath,
        targetPath: inspected.path
      });
      return inspected;
    };

    let rawContent: any;

    switch (mainLibDesc.machineName) {
      case 'H5P.MultiChoice':
        rawContent = await this.compileMultiChoice(ir, mediaCollector);
        break;

      case 'H5P.TrueFalse':
        rawContent = await this.compileTrueFalse(ir, mediaCollector);
        break;

      case 'H5P.Blanks':
        rawContent = await this.compileBlanks(ir, mediaCollector);
        break;

      case 'H5P.DragText':
        rawContent = await this.compileDragText(ir);
        break;

      case 'H5P.Dialogcards':
        rawContent = await this.compileDialogcards(ir, mediaCollector);
        break;

      case 'H5P.Flashcards':
        rawContent = await this.compileFlashcards(ir, mediaCollector);
        break;

      case 'H5P.Summary':
        rawContent = await this.compileSummary(ir);
        break;

      case 'H5P.SingleChoiceSet':
        rawContent = await this.compileSingleChoiceSet(ir);
        break;

      case 'H5P.CoursePresentation':
        rawContent = await this.compileCoursePresentation(ir, mediaCollector, baseDir);
        break;

      case 'H5P.Column':
        rawContent = await this.compileColumn(ir, mediaCollector, baseDir);
        break;

      case 'H5P.InteractiveBook':
        rawContent = await this.compileInteractiveBook(ir, mediaCollector, baseDir);
        break;

      default:
        // If content already contains parameters directly matching semantics
        rawContent = ir.params || ir.content || {};
        break;
    }

    // Hydrate parameters against the root library semantics & language
    const rootSemantics = await this.registry.getSemantics(mainLibDesc);
    const rootTrans = await this.registry.getLanguageTranslations(mainLibDesc, lang);
    const contentJson = hydrateSemantics(rootSemantics, rawContent, rootTrans);

    // Resolve all embedded libraries and compute deduplicated transitive dependencies
    const embeddedLibs = extractEmbeddedLibraries(contentJson);
    const preloadedDependencies = this.registry.resolveAllDependencies(mainLibDesc, embeddedLibs);

    const h5pJson = {
      title: ir.title || mainLibDesc.title || 'Untitled H5P Content',
      language: lang,
      mainLibrary: mainLibDesc.machineName,
      embedTypes: ['iframe'],
      license: 'U',
      defaultLanguage: lang,
      preloadedDependencies
    };

    return {
      mainLibrary: mainLibDesc,
      h5pJson,
      contentJson,
      mediaFiles
    };
  }

  // --- Sub-Compilers for Specific Content Types ---

  public async compileMultiChoice(ir: any, mediaCollector: (p: string) => Promise<MediaInfo>): Promise<any> {
    const answers = (ir.answers || []).map((ans: any) => ({
      text: `<div>${ans.text || ''}</div>`,
      correct: !!ans.correct,
      tipsAndFeedback: {
        tip: ans.tip || '',
        chosenFeedback: ans.feedback || ''
      }
    }));

    const correctCount = answers.filter((a: any) => a.correct).length;
    const isSingle = ir.singleAnswer !== undefined ? !!ir.singleAnswer : correctCount <= 1;

    let media: any = undefined;
    if (ir.image) {
      const inspected = await mediaCollector(ir.image);
      media = {
        type: {
          library: 'H5P.Image 1.1',
          params: {
            contentName: 'Image',
            file: inspected,
            alt: ir.imageAlt || ''
          },
          subContentId: generateUUID(),
          metadata: { contentType: 'Image', license: 'U', title: 'Question Media' }
        },
        disableImageZooming: false
      };
    }

    return {
      question: ir.question?.startsWith('<') ? ir.question : `<p>${ir.question || ''}</p>`,
      answers,
      behaviour: {
        enableRetry: ir.enableRetry !== undefined ? ir.enableRetry : true,
        enableSolutionsButton: ir.enableSolutionsButton !== undefined ? ir.enableSolutionsButton : true,
        singlePoint: isSingle,
        randomAnswers: ir.randomAnswers !== undefined ? ir.randomAnswers : true,
        type: isSingle ? 'single' : 'multi',
        showScorePoints: true
      },
      media
    };
  }

  public async compileTrueFalse(ir: any, mediaCollector: (p: string) => Promise<MediaInfo>): Promise<any> {
    let media: any = undefined;
    if (ir.image) {
      const inspected = await mediaCollector(ir.image);
      media = {
        type: {
          library: 'H5P.Image 1.1',
          params: {
            contentName: 'Image',
            file: inspected,
            alt: ir.imageAlt || ''
          },
          subContentId: generateUUID(),
          metadata: { contentType: 'Image', license: 'U', title: 'Question Media' }
        },
        disableImageZooming: false
      };
    }

    return {
      question: ir.question?.startsWith('<') ? ir.question : `<p>${ir.question || ''}</p>`,
      correct: ir.correct === true ? 'true' : 'false',
      behaviour: {
        enableRetry: true,
        enableSolutionsButton: true,
        confirmCheckDialog: false,
        confirmRetryDialog: false,
        autoCheck: false
      },
      l10n: {
        trueText: ir.trueLabel || 'True',
        falseText: ir.falseLabel || 'False',
        feedbackOnCorrect: ir.feedbackOnCorrect || '',
        feedbackOnWrong: ir.feedbackOnWrong || ''
      },
      media
    };
  }

  public async compileBlanks(ir: any, mediaCollector: (p: string) => Promise<MediaInfo>): Promise<any> {
    const questions: string[] = [];

    for (const item of ir.sentences || ir.questions || []) {
      if (typeof item === 'string') {
        questions.push(item.startsWith('<') ? item : `<p>${item}</p>`);
      } else if (typeof item === 'object' && item.text && Array.isArray(item.blanks)) {
        // Structured format: { text: "Oslo is the capital of {{0}}.", blanks: [{ accepted: ["Norway"], hint: "Europe" }] }
        let sentence = item.text;
        item.blanks.forEach((b: any, idx: number) => {
          const accepted = Array.isArray(b.accepted) ? b.accepted.join('/') : (b.accepted || b.answer || '');
          const tip = b.hint ? `:${b.hint}` : '';
          const blankStr = `*${accepted}${tip}*`;
          sentence = sentence.replace(new RegExp(`\\{\\{${idx}\\}\\}`, 'g'), blankStr);
        });
        questions.push(sentence.startsWith('<') ? sentence : `<p>${sentence}</p>`);
      }
    }

    let media: any = undefined;
    if (ir.image) {
      const inspected = await mediaCollector(ir.image);
      media = {
        type: {
          library: 'H5P.Image 1.1',
          params: {
            contentName: 'Image',
            file: inspected,
            alt: ir.imageAlt || ''
          },
          subContentId: generateUUID(),
          metadata: { contentType: 'Image', license: 'U', title: 'Question Media' }
        },
        disableImageZooming: false
      };
    }

    return {
      text: ir.taskDescription?.startsWith('<') ? ir.taskDescription : `<p>${ir.taskDescription || 'Fill in the missing words'}</p>`,
      questions,
      behaviour: {
        enableRetry: true,
        enableSolutionsButton: true,
        autoCheck: false,
        caseSensitive: false,
        showSolutionsRequiresInput: true,
        separateLines: false,
        disableImageZooming: false
      },
      media
    };
  }

  public async compileDragText(ir: any): Promise<any> {
    const paragraphs: string[] = [];
    for (const item of ir.sentences || ir.paragraphs || []) {
      if (typeof item === 'string') {
        paragraphs.push(item);
      } else if (typeof item === 'object' && item.text) {
        paragraphs.push(item.text);
      }
    }

    return {
      taskDescription: `<p>${ir.taskDescription || 'Drag the words into the correct boxes'}</p>`,
      textField: paragraphs.map((p) => (p.startsWith('<') ? p : `<p>${p}</p>`)).join('\n'),
      behaviour: {
        enableRetry: true,
        enableSolutionsButton: true,
        instantFeedback: false
      }
    };
  }

  public async compileDialogcards(ir: any, mediaCollector: (p: string) => Promise<MediaInfo>): Promise<any> {
    const dialogs = [];
    for (const card of ir.cards || []) {
      let imageObj: any = undefined;
      if (card.image) {
        const inspected = await mediaCollector(card.image);
        imageObj = inspected;
      }

      dialogs.push({
        text: card.front || card.question || '',
        answer: card.back || card.answer || '',
        image: imageObj,
        imageAltText: card.imageAlt || '',
        tips: {
          text: card.tip || ''
        }
      });
    }

    return {
      title: ir.title || 'Dialog Cards',
      description: ir.description || 'Turn cards to test your knowledge',
      dialogs,
      behaviour: {
        enableRetry: true,
        scaleTextNotCard: false,
        randomCards: true,
        maxProficiency: 5
      }
    };
  }

  public async compileFlashcards(ir: any, mediaCollector: (p: string) => Promise<MediaInfo>): Promise<any> {
    const cards = [];
    for (const card of ir.cards || []) {
      let imageObj: any = undefined;
      if (card.image) {
        const inspected = await mediaCollector(card.image);
        imageObj = inspected;
      }

      cards.push({
        text: card.question || card.front || '',
        answer: card.answer || card.back || '',
        image: imageObj,
        tip: card.tip || ''
      });
    }

    return {
      description: ir.description || 'Answer the questions on the cards',
      cards,
      progressText: 'Card @card of @total',
      next: 'Next',
      previous: 'Previous',
      checkAnswerText: 'Check'
    };
  }

  public async compileSummary(ir: any): Promise<any> {
    const summaries = (ir.summaries || []).map((s: any) => {
      const statements = Array.isArray(s) ? s : (s.statements || []);
      return {
        summary: statements.map((st: string) => `<p>${st}</p>`),
        tip: s.tip || ''
      };
    });

    return {
      intro: `<p>${ir.intro || 'Choose the correct statement.'}</p>`,
      summaries,
      solvedLabel: 'Solved:',
      scoreLabel: 'Score:',
      resultLabel: 'Your Result'
    };
  }

  public async compileSingleChoiceSet(ir: any): Promise<any> {
    const choices = (ir.choices || ir.questions || []).map((c: any) => ({
      question: `<p>${c.question || ''}</p>`,
      answers: (c.answers || []).map((a: string) => a)
    }));

    return {
      choices,
      behaviour: {
        timeoutCorrect: 2000,
        timeoutWrong: 3000,
        soundEffectsEnabled: true,
        enableRetry: true,
        enableSolutionsButton: true,
        passPercentage: 100
      }
    };
  }

  public async compileCoursePresentation(
    ir: any,
    mediaCollector: (p: string) => Promise<MediaInfo>,
    baseDir: string
  ): Promise<any> {
    const slides = [];

    for (const slideInput of ir.slides || []) {
      let imageAction: any = undefined;
      let quizAction: any = undefined;

      if (slideInput.image) {
        const imgPath = typeof slideInput.image === 'string' ? slideInput.image : slideInput.image.src;
        const alt = typeof slideInput.image === 'object' ? slideInput.image.alt : '';
        const inspected = await mediaCollector(imgPath);
        imageAction = wrapAsH5PImage(inspected, alt);
      }

      if (slideInput.activity || slideInput.quiz) {
        const subActivity = slideInput.activity || slideInput.quiz;
        const subCompiled = await this.compile(subActivity, baseDir);
        quizAction = {
          library: `${subCompiled.mainLibrary.machineName} ${subCompiled.mainLibrary.majorVersion}.${subCompiled.mainLibrary.minorVersion}`,
          params: subCompiled.contentJson,
          subContentId: generateUUID(),
          metadata: {
            contentType: subCompiled.mainLibrary.title || subCompiled.mainLibrary.machineName,
            license: 'U',
            title: subActivity.title || 'Slide Quiz'
          }
        };
      }

      const elements = buildSlideElements({
        layout: slideInput.layout,
        title: slideInput.title,
        subtitle: slideInput.subtitle,
        html: slideInput.html || slideInput.text,
        imageAction,
        quizAction,
        elements: slideInput.elements
      });

      slides.push({
        elements,
        slideBackgroundSelector: {
          fillType: 'fill',
          fillColor: '#ffffff'
        }
      });
    }

    return {
      presentation: {
        slides,
        slideNavigation: true,
        globalBackgroundSelector: {
          fillType: 'fill',
          fillColor: '#ffffff'
        }
      },
      overrideSettings: {
        overrideButtons: true,
        overrideShowSolutionButton: 'on',
        overrideRetryButton: 'on'
      }
    };
  }

  public async compileColumn(
    ir: any,
    mediaCollector: (p: string) => Promise<MediaInfo>,
    baseDir: string
  ): Promise<any> {
    const content = [];

    for (const item of ir.content || ir.elements || []) {
      if (item.type === 'text' || item.html || item.text) {
        const html = item.html || item.text || '';
        content.push({
          content: {
            library: 'H5P.AdvancedText 1.1',
            params: {
              text: html.startsWith('<') ? html : `<p>${html}</p>`
            },
            subContentId: generateUUID(),
            metadata: { contentType: 'Text', license: 'U', title: item.title || 'Text' }
          },
          useSeparator: item.separator !== false ? 'auto' : 'disabled'
        });
      } else if (item.type === 'image' || item.image) {
        const imgPath = typeof item.image === 'string' ? item.image : item.image.src;
        const alt = typeof item.image === 'object' ? item.image.alt : (item.alt || '');
        const inspected = await mediaCollector(imgPath);
        content.push({
          content: wrapAsH5PImage(inspected, alt),
          useSeparator: 'auto'
        });
      } else if (item.type) {
        // Nested interactive activity
        const subCompiled = await this.compile(item, baseDir);
        content.push({
          content: {
            library: `${subCompiled.mainLibrary.machineName} ${subCompiled.mainLibrary.majorVersion}.${subCompiled.mainLibrary.minorVersion}`,
            params: subCompiled.contentJson,
            subContentId: generateUUID(),
            metadata: {
              contentType: subCompiled.mainLibrary.title || subCompiled.mainLibrary.machineName,
              license: 'U',
              title: item.title || 'Activity'
            }
          },
          useSeparator: 'auto'
        });
      }
    }

    return {
      content
    };
  }

  public async compileInteractiveBook(
    ir: any,
    mediaCollector: (p: string) => Promise<MediaInfo>,
    baseDir: string
  ): Promise<any> {
    const chapters = [];

    for (const chap of ir.chapters || []) {
      // Each chapter in an Interactive Book is an H5P.Column 1.18 or H5P.CoursePresentation
      const colCompiled = await this.compile({
        title: chap.title || 'Chapter',
        type: 'H5P.Column',
        content: chap.content || []
      }, baseDir);

      chapters.push({
        title: chap.title || 'Chapter',
        content: {
          library: `${colCompiled.mainLibrary.machineName} ${colCompiled.mainLibrary.majorVersion}.${colCompiled.mainLibrary.minorVersion}`,
          params: colCompiled.contentJson,
          subContentId: generateUUID(),
          metadata: {
            contentType: 'Column',
            license: 'U',
            title: chap.title || 'Chapter'
          }
        }
      });
    }

    return {
      chapters,
      behaviour: {
        baseColor: '#1768c4',
        autoProgress: true
      }
    };
  }
}
