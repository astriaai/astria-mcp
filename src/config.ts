import dotenv from 'dotenv';

dotenv.config();

// API configuration
export const API = {
  BASE_URL: 'https://api.astria.ai',
  KEY: process.env.ASTRIA_API_KEY || '',
  TIMEOUT_MS: 30000,
  POLLING: {
    MAX_ATTEMPTS: 30,
    DELAY_MS: 2000
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
    MAX_IMAGES: 20,
    SUBJECT_TYPES: ['man', 'woman', 'cat', 'dog', 'boy', 'girl', 'style'],
    PRESETS: ['flux-lora-focus', 'flux-lora-portrait', 'flux-lora-fast']
  }
};

// Feature flags
export const FEATURES = {
  OPEN_IMAGES_IN_BROWSER: true,
  DISPLAY_IMAGES_IN_CHAT: true,
  LOG_ERRORS: process.env.ASTRIA_LOG_ERRORS === 'true'
};
