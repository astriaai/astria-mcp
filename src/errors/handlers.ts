import axios from 'axios';
import { AstriaError } from './errors';
import { AstriaErrorCode } from './codes';
import { z } from 'zod';

export function createErrorFromResponse(error: any): AstriaError {
    let message = 'Unknown error';
    let code = AstriaErrorCode.UNKNOWN_ERROR;
    let details = undefined;
    let httpStatus = undefined;

    if (axios.isAxiosError(error)) {
        httpStatus = error.response?.status;

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
                        message = data.errors.map((e: any) => {
                            if (typeof e === 'object' && e.field && e.message) {
                                return `${e.field}: ${e.message}`;
                            } else {
                                return String(e);
                            }
                        }).join(', ');
                    } else if (typeof data === 'object') {
                        const errorMessages: string[] = [];

                        Object.entries(data).forEach(([field, value]) => {
                            if (Array.isArray(value)) {
                                errorMessages.push(`${field}: ${value.join(', ')}`);
                            } else if (typeof value === 'string') {
                                errorMessages.push(`${field}: ${value}`);
                            }
                        });

                        if (errorMessages.length > 0) {
                            message = errorMessages.join('; ');
                        } else {
                            message = `API error (${httpStatus || 'unknown status'})`;
                        }
                    } else {
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
        return error;
    } else {
        message = error.message || 'Unknown error';
        code = AstriaErrorCode.SDK_ERROR;
        details = error;
    }

    return new AstriaError(
        `Astria SDK: ${message}`,
        code,
        details,
        httpStatus
    );
}

export function logError(_error: AstriaError, _context?: string): void {
    // Function intentionally empty - logging disabled
}


export function handleMcpError(error: any, context: string, isResource: boolean = false): any {
    const astriaError = error instanceof AstriaError
        ? error
        : createErrorFromResponse(error);

    let errorMessage = astriaError.toUserMessage();

    if (error instanceof z.ZodError) {
        errorMessage = `Invalid input parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
    }

    if (isResource) {
        throw new Error(`Failed to process ${context}: ${errorMessage}`);
    } else {
        return {
            isError: true,
            content: [{ type: "text", text: `Error in ${context}: ${errorMessage}` }],
        };
    }
}
