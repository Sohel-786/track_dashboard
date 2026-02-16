import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadFile(fileUri: string, isRaw: boolean = false, fileName?: string) {
    try {
        const res = await cloudinary.uploader.upload(fileUri, {
            resource_type: isRaw ? 'raw' : 'image',
            folder: 'trace_dashboard',
            use_filename: true,
            unique_filename: true,
            public_id: fileName ? fileName.split('.')[0] : undefined,
        });
        return res.secure_url;
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        throw new Error('Upload failed');
    }
}

export default cloudinary;
