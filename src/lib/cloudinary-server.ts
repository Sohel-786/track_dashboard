import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadFile(fileUri: string, isRaw: boolean = false, fileName?: string) {
    let lastError;
    // Retry up to 2 times for transient failures
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const res = await cloudinary.uploader.upload(fileUri, {
                resource_type: isRaw ? 'raw' : 'image',
                folder: 'trace_dashboard',
                use_filename: true,
                unique_filename: true,
                // Sanitize filename for public_id and add a unique suffix to prevent collisions
                public_id: fileName ? `${fileName.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}` : undefined,
            });
            return res.secure_url;
        } catch (error: any) {
            lastError = error;
            console.error(`Cloudinary upload attempt ${attempt} failed:`, error.message || error);
            if (attempt < 2) {
                // Wait briefly before retrying
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    console.error('All Cloudinary upload attempts failed:', lastError);
    throw new Error('Upload failed. Please check your file size and internet connection.');
}

export default cloudinary;
