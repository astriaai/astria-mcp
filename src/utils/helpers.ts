/**
 * Helper utility functions
 */

// Validates a URL string
export function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch (e) {
        return false;
    }
}

// Formats a date string for display
export function formatDate(dateString: string | null | undefined): string {
    if (!dateString) return 'N/A';

    try {
        const date = new Date(dateString);
        return date.toLocaleString();
    } catch (e) {
        return dateString;
    }
}

// Truncates a string to a maximum length
export function truncateString(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
}

// Safely parses JSON
export function safeJsonParse(jsonString: string, defaultValue: any = null): any {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        return defaultValue;
    }
}

// Delays execution for a specified number of milliseconds
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Parses a string ID into a number
export function parseId(idString: unknown, paramName: string): number {
    if (typeof idString !== 'string') {
        throw new Error(`Invalid type for ${paramName}: expected string, got ${typeof idString}`);
    }
    const id = parseInt(idString, 10);
    if (isNaN(id) || id <= 0) {
        throw new Error(`Invalid numeric value for ${paramName}: '${idString}'`);
    }
    return id;
}
