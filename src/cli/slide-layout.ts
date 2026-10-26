import { generateUUID } from './media-inspector';

export interface ISlideElementLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  action: any;
  backgroundOpacity?: number;
}

export type SlideLayoutType =
  | 'title-slide'
  | 'header-bullets'
  | 'text-left-image-right'
  | 'image-left-text-right'
  | 'full-image'
  | 'full-slide-quiz'
  | 'split-quiz-diagram';

export interface ISlideContentInput {
  layout?: SlideLayoutType;
  title?: string;
  subtitle?: string;
  html?: string;
  imageAction?: any;
  quizAction?: any;
  elements?: ISlideElementLayout[];
}

export function createTextElement(html: string, title: string = 'Text'): any {
  return {
    library: 'H5P.AdvancedText 1.1',
    params: {
      text: html.startsWith('<') ? html : `<p>${html}</p>`
    },
    subContentId: generateUUID(),
    metadata: {
      contentType: 'Text',
      license: 'U',
      title
    }
  };
}

/**
 * Applies a deterministic 2D layout grid to convert high-level slide content into
 * positioned elements for H5P.CoursePresentation.
 */
export function buildSlideElements(input: ISlideContentInput): ISlideElementLayout[] {
  if (input.elements && input.elements.length > 0) {
    return input.elements;
  }

  const elements: ISlideElementLayout[] = [];
  const layout: SlideLayoutType = input.layout || (input.quizAction ? 'full-slide-quiz' : input.imageAction ? 'text-left-image-right' : 'header-bullets');

  switch (layout) {
    case 'title-slide': {
      if (input.title) {
        elements.push({
          x: 10,
          y: 28,
          width: 80,
          height: 25,
          backgroundOpacity: 0,
          action: createTextElement(`<h1 style="text-align: center; font-size: 2.2em; margin: 0;">${input.title}</h1>`, 'Title')
        });
      }
      if (input.subtitle || input.html) {
        const text = input.subtitle || input.html || '';
        elements.push({
          x: 10,
          y: 56,
          width: 80,
          height: 30,
          backgroundOpacity: 0,
          action: createTextElement(`<p style="text-align: center; font-size: 1.2em; color: #444;">${text}</p>`, 'Subtitle')
        });
      }
      break;
    }

    case 'header-bullets': {
      let topOffset = 6;
      if (input.title) {
        elements.push({
          x: 5,
          y: topOffset,
          width: 90,
          height: 14,
          backgroundOpacity: 0,
          action: createTextElement(`<h2 style="margin: 0; font-size: 1.6em; border-bottom: 2px solid #0070c0; padding-bottom: 4px;">${input.title}</h2>`, 'Header')
        });
        topOffset = 22;
      }
      if (input.html) {
        elements.push({
          x: 5,
          y: topOffset,
          width: 90,
          height: 94 - topOffset,
          backgroundOpacity: 0,
          action: createTextElement(input.html, 'Body Content')
        });
      }
      break;
    }

    case 'text-left-image-right': {
      let topOffset = 6;
      if (input.title) {
        elements.push({
          x: 5,
          y: topOffset,
          width: 90,
          height: 12,
          backgroundOpacity: 0,
          action: createTextElement(`<h2 style="margin: 0; font-size: 1.5em;">${input.title}</h2>`, 'Header')
        });
        topOffset = 20;
      }
      if (input.html) {
        elements.push({
          x: 5,
          y: topOffset,
          width: 45,
          height: 94 - topOffset,
          backgroundOpacity: 0,
          action: createTextElement(input.html, 'Text Column')
        });
      }
      if (input.imageAction) {
        elements.push({
          x: 52,
          y: topOffset,
          width: 43,
          height: 94 - topOffset,
          backgroundOpacity: 0,
          action: input.imageAction
        });
      }
      break;
    }

    case 'image-left-text-right': {
      let topOffset = 6;
      if (input.title) {
        elements.push({
          x: 5,
          y: topOffset,
          width: 90,
          height: 12,
          backgroundOpacity: 0,
          action: createTextElement(`<h2 style="margin: 0; font-size: 1.5em;">${input.title}</h2>`, 'Header')
        });
        topOffset = 20;
      }
      if (input.imageAction) {
        elements.push({
          x: 5,
          y: topOffset,
          width: 43,
          height: 94 - topOffset,
          backgroundOpacity: 0,
          action: input.imageAction
        });
      }
      if (input.html) {
        elements.push({
          x: 50,
          y: topOffset,
          width: 45,
          height: 94 - topOffset,
          backgroundOpacity: 0,
          action: createTextElement(input.html, 'Text Column')
        });
      }
      break;
    }

    case 'full-image': {
      let topOffset = 5;
      if (input.title) {
        elements.push({
          x: 5,
          y: topOffset,
          width: 90,
          height: 10,
          backgroundOpacity: 0,
          action: createTextElement(`<h3 style="margin: 0;">${input.title}</h3>`, 'Header')
        });
        topOffset = 16;
      }
      if (input.imageAction) {
        elements.push({
          x: 8,
          y: topOffset,
          width: 84,
          height: 94 - topOffset,
          backgroundOpacity: 0,
          action: input.imageAction
        });
      }
      break;
    }

    case 'full-slide-quiz': {
      let topOffset = 5;
      if (input.title) {
        elements.push({
          x: 5,
          y: topOffset,
          width: 90,
          height: 10,
          backgroundOpacity: 0,
          action: createTextElement(`<h3 style="margin: 0; color: #0070c0;">${input.title}</h3>`, 'Quiz Header')
        });
        topOffset = 16;
      }
      if (input.quizAction) {
        elements.push({
          x: 5,
          y: topOffset,
          width: 90,
          height: 94 - topOffset,
          backgroundOpacity: 0,
          action: input.quizAction
        });
      }
      break;
    }

    case 'split-quiz-diagram': {
      let topOffset = 5;
      if (input.title) {
        elements.push({
          x: 5,
          y: topOffset,
          width: 90,
          height: 10,
          backgroundOpacity: 0,
          action: createTextElement(`<h3 style="margin: 0;">${input.title}</h3>`, 'Header')
        });
        topOffset = 16;
      }
      if (input.imageAction) {
        elements.push({
          x: 5,
          y: topOffset,
          width: 42,
          height: 94 - topOffset,
          backgroundOpacity: 0,
          action: input.imageAction
        });
      }
      if (input.quizAction) {
        elements.push({
          x: 49,
          y: topOffset,
          width: 46,
          height: 94 - topOffset,
          backgroundOpacity: 0,
          action: input.quizAction
        });
      }
      break;
    }
  }

  return elements;
}
