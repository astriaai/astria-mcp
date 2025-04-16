import dotenv from 'dotenv';
import path from 'path';
import os from 'os';

dotenv.config();

// API configuration
export const API = {
  BASE_URL: 'https://api.astria.ai',
  KEY: process.env.ASTRIA_API_KEY || '',
  TIMEOUT_MS: 300000,
  POLLING: {
    MAX_ATTEMPTS: 300,
    DELAY_MS: 1000
  }
};

// Model configuration
export const MODELS = {
  FLUX: {
    ID: 1504944,
    NAME: 'flux'
  },
  DEFAULT: 'flux'
};

// Validation rules
export const VALIDATION = {
  TUNE: {
    MIN_IMAGES: 4,
    MAX_IMAGES: 8,
    SUBJECT_TYPES: ['man', 'woman', 'cat', 'dog', 'boy', 'girl', 'style'],
    PRESETS: ['flux-lora-focus', 'flux-lora-portrait', 'flux-lora-fast']
  }
};

// Storage configuration
export const STORAGE = {
  // Default directory for storing generated images and training images
  // Can be overridden with ASTRIA_IMAGE_DIRECTORY environment variable
  IMAGE_DIRECTORY: process.env.ASTRIA_IMAGE_DIRECTORY || (
    process.platform === 'win32'
      ? path.join(os.homedir(), 'AppData', 'Local', 'astria-mcp')
      : path.join(os.homedir(), '.astria-mcp')
  ),
  // Subdirectory for training images used in fine-tuning
  TUNE_IMAGES_SUBDIRECTORY: 'tune_images'
};

