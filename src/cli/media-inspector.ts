import fs from 'fs-extra';
import path from 'path';
import sizeOf from 'image-size';
import mimeTypes from 'mime-types';

export interface MediaInfo {
  path: string;
  mime: string;
  width?: number;
  height?: number;
  copyright?: {
    license: string;
    title?: string;
    author?: string;
  };
}

/**
 * Inspects a media file on disk and returns H5P-compliant media metadata.
 */
export async function inspectMediaFile(filePath: string, relativeTargetDir: string = 'images'): Promise<MediaInfo> {
  const filename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  let mime = mimeTypes.lookup(filePath) || 'application/octet-stream';

  let width = 800;
  let height = 600;

  if (ext === '.svg') {
    mime = 'image/svg+xml';
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const viewBoxMatch = content.match(/viewBox=["']\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)["']/i);
      if (viewBoxMatch) {
        width = Math.round(parseFloat(viewBoxMatch[3]));
        height = Math.round(parseFloat(viewBoxMatch[4]));
      } else {
        const widthMatch = content.match(/width=["']([0-9.]+)["']/i);
        const heightMatch = content.match(/height=["']([0-9.]+)["']/i);
        if (widthMatch) width = Math.round(parseFloat(widthMatch[1]));
        if (heightMatch) height = Math.round(parseFloat(heightMatch[1]));
      }
    } catch {
      width = 800;
      height = 600;
    }
  } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext)) {
    try {
      const buffer = await fs.readFile(filePath);
      const dimensions = sizeOf(buffer);
      if (dimensions.width && dimensions.height) {
        width = dimensions.width;
        height = dimensions.height;
      }
    } catch {
      width = 800;
      height = 600;
    }
  }

  return {
    path: `${relativeTargetDir}/${filename}`,
    mime,
    width,
    height,
    copyright: {
      license: 'U'
    }
  };
}

/**
 * Wraps a media info object into an H5P.Image 1.1 library object for embedding in composite types.
 */
export function wrapAsH5PImage(mediaInfo: MediaInfo, altText: string = ''): any {
  return {
    library: 'H5P.Image 1.1',
    params: {
      contentName: 'Image',
      file: {
        path: mediaInfo.path,
        mime: mediaInfo.mime,
        copyright: mediaInfo.copyright || { license: 'U' },
        width: mediaInfo.width,
        height: mediaInfo.height
      },
      alt: altText || 'Interactive illustration'
    },
    subContentId: generateUUID(),
    metadata: {
      contentType: 'Image',
      license: 'U',
      title: altText || 'Embedded Image'
    }
  };
}

/**
 * Helper to generate a UUIDv4 without external dependencies.
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
