export interface TuneResponse {
    id: number;
    title: string;
    model_type: string | null;
    name: string;
    token?: string;
    trained_at?: string;
    created_at: string;
    updated_at: string;
    started_training_at?: string;
    expires_at?: string;
    eta?: string;
    is_api: boolean;
    url: string;
    callback?: string | null;
    orig_images?: string[];
    base_tune_id?: number | null;
    branch?: string;
    args?: any | null;
    steps?: number | null;
    face_crop?: boolean;
    ckpt_url?: string;
    ckpt_urls?: string[];
}

export interface PromptResponse {
    id: number;
    text: string;
    images: string[];
    error?: string;
    status?: string;
    callback?: string | null;
    trained_at?: string;
    started_training_at?: string;
    created_at: string;
    updated_at: string;
    tune_id: number;
    prompt_likes_count: number;
    base_pack_id?: number | null;
    input_image?: string | null;
    mask_image?: string | null;
    negative_prompt: string;
    cfg_scale?: number | null;
    steps?: number | null;
    super_resolution: boolean;
    ar?: string;
    num_images: number;
    seed?: number | null;
    controlnet_conditioning_scale?: number | null;
    controlnet_txt2img: boolean;
    denoising_strength?: number | null;
    style?: string | null;
    w?: number | null;
    h?: number | null;
    url: string;
    liked: boolean;
    tune?: {
        id: number;
        title: string;
    };
    tunes: any[];
}

export interface ImageGenerationParams {
    prompt: string;
    tune_title?: string;
    aspect_ratio?: 'square' | 'landscape' | 'portrait';
    width?: number;
    height?: number;
    seed?: number;
    num_images?: number;
}

export interface ImageGenerationResult {
    id: number;
    prompt: string;
    images: string[];
    error?: string;
}

export interface TuneSearchResult {
    tune: TuneResponse | null;
    availableTunes: string[];
}