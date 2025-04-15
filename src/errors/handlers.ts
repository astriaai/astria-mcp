import axios from 'axios';
import { AstriaError } from './errors';
import { AstriaErrorCode } from './codes';
import { FEATURES } from '../config';

export function createErrorFromResponse(error: any): AstriaError {
    // Default values
    let message = 'Unknown error';
    let code = AstriaErrorCode.UNKNOWN_ERROR;
    let details = undefined;
    let httpStatus = undefined;

    // Handle Axios errors
    if (axios.isAxiosError(error)) {
        httpStatus = error.response?.status;

        // Determine error code based on HTTP status
        if (httpStatus) {
            if (httpStatus === 401 || httpStatus === 403) {
                code = AstriaErrorCode.AUTH_ERROR;
            } else if (httpStatus === 404) {
                code = AstriaErrorCode.RESOURCE_NOT_FOUND;
            } else if (httpStatus === 422) {
                code = AstriaErrorCode.VALIDATION_ERROR;
            } else if (httpStatus === 429) {
                code = AstriaErrorCode.RATE_LIMIT_ERROR;
            } else {
                code = AstriaErrorCode.API_ERROR;
            }
        } else if (error.code === 'ECONNABORTED') {
            code = AstriaErrorCode.TIMEOUT_ERROR;
        } else if (error.code === 'ERR_NETWORK') {
            code = AstriaErrorCode.NETWORK_ERROR;
        }

        // Extract message and details from response
        if (error.response?.data) {
            details = error.response.data;

            if (typeof error.response.data === 'object') {
                try {
                    const data = error.response.data;
                    if (data.error) {
                        message = data.error;
                    } else if (data.message) {
                        message = data.message;
                    } else if (data.errors && Array.isArray(data.errors)) {
                        // Handle Rails-style validation errors
                        message = data.errors.map((e: any) => {
                            if (typeof e === 'object' && e.field && e.message) {
                                return `${e.field}: ${e.message}`;
                            } else {
                                return String(e);
                            }
                        }).join(', ');
                    } else if (typeof data === 'object') {
                        // Try to extract field-specific errors (common in Astria API)
                        const errorMessages: string[] = [];

                        // Process each field in the response
                        Object.entries(data).forEach(([field, value]) => {
                            if (Array.isArray(value)) {
                                // Format: { field: ["error message", "another error"] }
                                errorMessages.push(`${field}: ${value.join(', ')}`);
                            } else if (typeof value === 'string') {
                                // Format: { field: "error message" }
                                errorMessages.push(`${field}: ${value}`);
                            }
                        });

                        if (errorMessages.length > 0) {
                            message = errorMessages.join('; ');
                        } else {
                            // If we couldn't extract specific errors, use a generic message with the status
                            message = `API error (${httpStatus || 'unknown status'})`;
                        }
                    } else {
                        // Use a generic message with the status
                        message = `API error (${httpStatus || 'unknown status'})`;
                    }
                } catch (jsonError) {
                    message = 'Error parsing API response';
                }
            } else {
                message = String(error.response.data);
            }
        } else {
            message = error.message || 'Network error';
        }
    } else if (error instanceof AstriaError) {
        // If it's already an AstriaError, just return it
        return error;
    } else {
        // Handle generic errors
        message = error.message || 'Unknown error';
        code = AstriaErrorCode.SDK_ERROR;
        details = error;
    }

    // Create and return the AstriaError
    return new AstriaError(
        `Astria SDK: ${message}`,
        code,
        details,
        httpStatus
    );
}

export function logError(error: AstriaError, context?: string): void {
    if (FEATURES.LOG_ERRORS) {
        const contextStr = context ? `[${context}] ` : '';
        console.error(`${contextStr}[${error.code}] ${error.message}`, error.details || '');
    }
}
