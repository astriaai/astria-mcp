// Error code definitions for the Astria SDK

// Error codes for Astria SDK errors
export enum AstriaErrorCode {
    // General errors
    UNKNOWN_ERROR = 'UNKNOWN_ERROR',
    NETWORK_ERROR = 'NETWORK_ERROR',
    TIMEOUT_ERROR = 'TIMEOUT_ERROR',

    // Authentication errors
    AUTH_ERROR = 'AUTH_ERROR',

    // API errors
    API_ERROR = 'API_ERROR',
    RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
    RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
    VALIDATION_ERROR = 'VALIDATION_ERROR',

    // SDK errors
    SDK_ERROR = 'SDK_ERROR',
    POLLING_TIMEOUT = 'POLLING_TIMEOUT'
}
