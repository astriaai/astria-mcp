// Type definitions for Astria API requests and responses

// Base tune information
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
    /** Type of model (lora, faceid, etc.) */
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

// Tune creation request parameters
export interface CreateTuneParams {
    title: string;
    name: string;
    image_urls: string[];
    preset?: string;
    callback?: string;
    characteristics?: Record<string, string>;
}

// Image generation prompt parameters
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

// Image generation request parameters
export interface GenerateImageParams {
    prompt: PromptParams;
    lora_tune_id?: number;
    /** Weight of the LoRA effect (0.1-1.0) */
    lora_weight?: number;
}

// Image generation response
export interface GenerateImageResponse {
    id: number;
    text: string;
    images: string[];
    error?: string;
}

// List tunes response
export type ListTunesResponse = TuneInfo[];
