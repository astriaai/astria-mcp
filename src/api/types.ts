// Type definitions for Astria API requests and responses

export interface TuneInfo {
    id: number;
    title: string;
    name: string;
    is_api: boolean;
    token: string;
    eta: string;
    callback: string | null;
    trained_at: string | null;
    started_training_at: string | null;
    expires_at: string | null;
    created_at: string;
    model_type: string | null;
    updated_at: string;
    base_tune_id?: number;
    branch?: string;
    args?: string | null;
    steps?: number | null;
    face_crop?: boolean;
    ckpt_url?: string | null;
    ckpt_urls?: string[];
    url: string;
    orig_images: string[];
}


export interface ImageData {
    name: string;
    data: string;
}

export interface CreateTuneParams {
    title: string;
    name: string;
    image_urls?: string[];
    image_data?: ImageData[];
    preset?: string;
    callback?: string;
    characteristics?: Record<string, string>;
    branch?: 'sd15' | 'sdxl1' | 'fast';
}

export interface PromptParams {
    text: string;
    negative_prompt?: string;
    super_resolution?: boolean;
    inpaint_faces?: boolean;
    width?: number;
    height?: number;
    num_images?: number;
    guidance_scale?: number;
    seed?: number;
}

export interface GenerateImageParams {
    prompt: PromptParams;
}

export interface GenerateImageResponse {
    id: number;
    text: string;
    images: string[];
    error?: string;
}

export type ListTunesResponse = TuneInfo[];
