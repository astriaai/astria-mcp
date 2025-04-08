// Configuration settings for the Astria MCP implementation

import dotenv from 'dotenv';

dotenv.config();

export const API_CONFIG = {
  BASE_URL: 'https://api.astria.ai',
  API_KEY: process.env.ASTRIA_API_KEY || '',
  TIMEOUT_MS: 30000,
  MAX_POLLING_ATTEMPTS: 30,
  POLLING_DELAY_MS: 2000
};

export const MODEL_CONFIG = {
  FLUX_MODEL_ID: 1504944,
  MODEL_IDS: {
    'flux': 1504944
  },
  DEFAULT_MODEL: 'flux'
};

export const VALIDATION_CONFIG = {
  MIN_IMAGES_FOR_TUNE: 4,
  MAX_IMAGES_FOR_TUNE: 20,
  VALID_SUBJECT_TYPES: ['man', 'woman', 'cat', 'dog', 'boy', 'girl', 'style'],
  VALID_PRESETS: ['flux-lora-focus', 'flux-lora-portrait', 'flux-lora-fast']
};

export const FEATURE_FLAGS = {
  OPEN_IMAGES_IN_BROWSER: true,
  DISPLAY_IMAGES_IN_CHAT: true,
  ENABLE_ERROR_LOGGING: false
};
