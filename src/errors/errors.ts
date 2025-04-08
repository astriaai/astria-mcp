// Custom error classes for the Astria SDK

import { AstriaErrorCode } from './codes';

export class AstriaError extends Error {
    constructor(
        message: string,
        public readonly code: AstriaErrorCode,
        public readonly details?: any,
        public readonly httpStatus?: number
    ) {
        super(message);
        this.name = 'AstriaError';

        // This is needed to make instanceof work correctly with TypeScript
        Object.setPrototypeOf(this, AstriaError.prototype);
    }

    toUserMessage(): string {
        let message = `${this.message}`;

        // Add helpful context based on error code
        switch (this.code) {
            case AstriaErrorCode.AUTH_ERROR:
                message += " Please check your API key.";
                break;
            case AstriaErrorCode.RATE_LIMIT_ERROR:
                message += " Please try again later.";
                break;
            case AstriaErrorCode.RESOURCE_NOT_FOUND:
                message += " The requested resource could not be found.";
                break;
            case AstriaErrorCode.VALIDATION_ERROR:
                message += " Please check your input parameters.";
                break;
            case AstriaErrorCode.POLLING_TIMEOUT:
                message += " The operation took too long to complete.";
                break;
        }

        return message;
    }
}
