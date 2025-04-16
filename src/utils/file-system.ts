import fs from 'fs';
import path from 'path';
import { STORAGE } from '../config.js';

export function ensureDirectoriesExist(): boolean {
  try {
    if (!fs.existsSync(STORAGE.IMAGE_DIRECTORY)) {
      fs.mkdirSync(STORAGE.IMAGE_DIRECTORY, { recursive: true });
    }

    const tuneImagesDir = path.join(STORAGE.IMAGE_DIRECTORY, STORAGE.TUNE_IMAGES_SUBDIRECTORY);
    if (!fs.existsSync(tuneImagesDir)) {
      fs.mkdirSync(tuneImagesDir, { recursive: true });
    }
    return true;
  } catch (error) {
    // Return false to indicate failure
    return false;
  }
}

export function saveBase64Image(base64Data: string, filename: string): string {
  let finalFilename = filename;
  const ext = path.extname(filename);
  const baseName = path.basename(filename, ext);

  const filePath = path.join(STORAGE.IMAGE_DIRECTORY, finalFilename);

  if (fs.existsSync(filePath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    finalFilename = `${baseName}-${timestamp}${ext}`;
  }

  const finalPath = path.join(STORAGE.IMAGE_DIRECTORY, finalFilename);
  const buffer = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(finalPath, buffer);

  return finalPath;
}

export function getTuneImageFiles(): string[] {
  const tuneImagesDir = path.join(STORAGE.IMAGE_DIRECTORY, STORAGE.TUNE_IMAGES_SUBDIRECTORY);

  if (!fs.existsSync(tuneImagesDir)) {
    return [];
  }

  try {
    return fs.readdirSync(tuneImagesDir)
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
      });
  } catch {
    return [];
  }
}

export function readTuneImageAsBase64(filename: string): { data: string, mimeType: string } {
  const filePath = path.join(STORAGE.IMAGE_DIRECTORY, STORAGE.TUNE_IMAGES_SUBDIRECTORY, filename);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filename}`);
  }

  const ext = path.extname(filename).toLowerCase();
  let mimeType = 'application/octet-stream';

  if (ext === '.jpg' || ext === '.jpeg') {
    mimeType = 'image/jpeg';
  } else if (ext === '.png') {
    mimeType = 'image/png';
  } else if (ext === '.webp') {
    mimeType = 'image/webp';
  } else if (ext === '.gif') {
    mimeType = 'image/gif';
  }

  const data = fs.readFileSync(filePath);
  const base64Data = data.toString('base64');

  return { data: base64Data, mimeType };
}

export async function openFile(filePath: string): Promise<void> {
  const open = (await import('open')).default;
  await open(filePath);
}

