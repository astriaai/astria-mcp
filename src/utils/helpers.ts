// Utility functions for the Astria MCP implementation

// Parses a string ID into a number
// Validates that the ID is a positive integer and throws descriptive errors
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

// Creates a delay using a Promise
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Safely parses JSON without throwing exceptions
export function safeJsonParse<T>(jsonString: string, defaultValue: T): T {
    try {
        return JSON.parse(jsonString) as T;
    } catch (e) {
        return defaultValue;
    }
}

// Determines the MIME type based on a file extension in a URL
// Falls back to image/jpeg if the extension is not recognized
export function getMimeTypeFromUrl(url: string): string {
    if (url.endsWith('.png')) return 'image/png';
    if (url.endsWith('.gif')) return 'image/gif';
    if (url.endsWith('.webp')) return 'image/webp';
    if (url.endsWith('.svg')) return 'image/svg+xml';
    if (url.endsWith('.jpg') || url.endsWith('.jpeg')) return 'image/jpeg';
    return 'image/jpeg'; // Default
}

// Fetches an image and returns it as a base64-encoded string
// Uses axios to download the image and determines the MIME type from the URL
export async function fetchImageAsBase64(imageUrl: string): Promise<{ data: string, mimeType: string }> {
    try {
        const axios = (await import('axios')).default;
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });

        // Get the MIME type before we start processing the data
        const mimeType = getMimeTypeFromUrl(imageUrl);

        // Process the data
        const buffer = Buffer.from(response.data, 'binary');
        const base64Data = buffer.toString('base64');

        return { data: base64Data, mimeType };
    } catch (error) {
        throw error;
    }
}

