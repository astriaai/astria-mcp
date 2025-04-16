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


export function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch (e) {
        return false;
    }
}


export function formatDate(dateString: string | null | undefined): string {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleString();
    } catch (e) {
        return dateString;
    }
}


export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}


export function safeJsonParse<T>(jsonString: string, defaultValue: T): T {
    try {
        return JSON.parse(jsonString) as T;
    } catch (e) {
        return defaultValue;
    }
}


export function getMimeTypeFromUrl(url: string): string {
    if (url.endsWith('.png')) return 'image/png';
    if (url.endsWith('.gif')) return 'image/gif';
    if (url.endsWith('.webp')) return 'image/webp';
    if (url.endsWith('.svg')) return 'image/svg+xml';
    if (url.endsWith('.jpg') || url.endsWith('.jpeg')) return 'image/jpeg';
    return 'image/jpeg'; // Default
}


export interface ImageOptions {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  thumbnail?: boolean;
}

export async function fetchImageAsBase64(imageUrl: string, options?: ImageOptions): Promise<{ data: string, mimeType: string }> {
    const axios = (await import('axios')).default;
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const mimeType = getMimeTypeFromUrl(imageUrl);

    // If no resize options are provided, return the original image
    if (!options || (!options.width && !options.height && !options.thumbnail)) {
        const buffer = Buffer.from(response.data, 'binary');
        const base64Data = buffer.toString('base64');
        return { data: base64Data, mimeType };
    }

    // Use sharp to resize the image
    const sharp = (await import('sharp')).default;
    let sharpInstance = sharp(response.data);

    // If thumbnail option is true, use it for better quality/size ratio
    if (options.thumbnail) {
        // Default thumbnail size if not specified
        const width = options.width || 300;
        const height = options.height;

        sharpInstance = sharpInstance.resize({
            width,
            height,
            fit: options.fit || 'inside',
            withoutEnlargement: true
        }).jpeg({
            quality: 80,
            progressive: true
        });
    } else {
        // Regular resize with provided options
        sharpInstance = sharpInstance.resize({
            width: options.width,
            height: options.height,
            fit: options.fit || 'inside',
            withoutEnlargement: true
        });
    }

    // Convert to buffer and then to base64
    const resizedBuffer = await sharpInstance.toBuffer();
    const base64Data = resizedBuffer.toString('base64');

    return { data: base64Data, mimeType };
}

