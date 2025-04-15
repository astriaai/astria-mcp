import fs from 'fs';
import path from 'path';
import { STORAGE, FEATURES } from '../config.js';

// Ensures that the required directories exist
// Creates them if they don't exist
export function ensureDirectoriesExist(): void {
  try {
    // Ensure main image directory exists
    if (!fs.existsSync(STORAGE.IMAGE_DIRECTORY)) {
      fs.mkdirSync(STORAGE.IMAGE_DIRECTORY, { recursive: true });
      if (FEATURES.LOG_ERRORS) {
        console.error(`Created image directory: ${STORAGE.IMAGE_DIRECTORY}`);
      }
    }

    // Ensure tune images directory exists
    const tuneImagesDir = path.join(STORAGE.IMAGE_DIRECTORY, STORAGE.TUNE_IMAGES_SUBDIRECTORY);
    if (!fs.existsSync(tuneImagesDir)) {
      fs.mkdirSync(tuneImagesDir, { recursive: true });
      if (FEATURES.LOG_ERRORS) {
        console.error(`Created tune images directory: ${tuneImagesDir}`);
      }
    }
  } catch (error) {
    if (FEATURES.LOG_ERRORS) {
      console.error(`Failed to create directories: ${error}`);
    }
    // Don't throw - we'll fall back to URL-only mode
  }
}

// Saves a base64-encoded image to the local filesystem
// Takes base64 data and a filename, returns the full path to the saved file
export function saveBase64Image(base64Data: string, filename: string): string {
  try {
    // Generate a unique filename if the file already exists
    let finalFilename = filename;
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext);

    const filePath = path.join(STORAGE.IMAGE_DIRECTORY, finalFilename);

    if (fs.existsSync(filePath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      finalFilename = `${baseName}-${timestamp}${ext}`;
    }

    const finalPath = path.join(STORAGE.IMAGE_DIRECTORY, finalFilename);

    // Write the file to avoid memory issues with large images
    try {
      // Create a buffer from the base64 data
      const buffer = Buffer.from(base64Data, 'base64');

      // Write the file
      fs.writeFileSync(finalPath, buffer);

      if (FEATURES.LOG_ERRORS) {
        console.error(`Saved image to: ${finalPath}`);
      }

      return finalPath;
    } catch (writeError) {
      if (FEATURES.LOG_ERRORS) {
        console.error(`Failed to write image file: ${writeError}`);
      }
      throw writeError;
    }
  } catch (error) {
    if (FEATURES.LOG_ERRORS) {
      console.error(`Failed to save image: ${error}`);
    }
    throw error;
  }
}

// Gets a list of files in the tune images directory
// Returns an array of filenames with supported image extensions
export function getTuneImageFiles(): string[] {
  try {
    const tuneImagesDir = path.join(STORAGE.IMAGE_DIRECTORY, STORAGE.TUNE_IMAGES_SUBDIRECTORY);
    return fs.readdirSync(tuneImagesDir)
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
      });
  } catch (error) {
    if (FEATURES.LOG_ERRORS) {
      console.error(`Failed to get tune image files: ${error}`);
    }
    return [];
  }
}

// Reads a file from the tune images directory and returns it as base64
// Returns an object with base64 data and mime type
export function readTuneImageAsBase64(filename: string): { data: string, mimeType: string } {
  try {
    const filePath = path.join(STORAGE.IMAGE_DIRECTORY, STORAGE.TUNE_IMAGES_SUBDIRECTORY, filename);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filename}`);
    }

    // Determine mime type from extension before reading the file
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

    // Read the file
    try {
      const data = fs.readFileSync(filePath);
      const base64Data = data.toString('base64');

      return { data: base64Data, mimeType };
    } catch (readError) {
      if (FEATURES.LOG_ERRORS) {
        console.error(`Failed to read image file: ${readError}`);
      }
      throw readError;
    }
  } catch (error) {
    if (FEATURES.LOG_ERRORS) {
      console.error(`Failed to read tune image: ${error}`);
    }
    throw error;
  }
}

// Opens a file with the system's default application
// Uses the 'open' package to launch the file with the system's default program
export async function openFile(filePath: string): Promise<void> {
  try {
    const open = (await import('open')).default;
    await open(filePath);
    if (FEATURES.LOG_ERRORS) {
      console.error(`Opened file: ${filePath}`);
    }
  } catch (error) {
    if (FEATURES.LOG_ERRORS) {
      console.error(`Failed to open file: ${error}`);
    }
    throw error;
  }
}

