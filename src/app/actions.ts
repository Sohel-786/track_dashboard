'use server';

import { uploadFile } from '@/lib/cloudinary-server';

export async function uploadToCloudinaryAction(formData: FormData) {
    const file = formData.get('file') as File;
    const isRaw = formData.get('isRaw') === 'true';

    if (!file) throw new Error('No file provided');

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileBase64 = `data:${file.type};base64,${buffer.toString('base64')}`;

    return await uploadFile(fileBase64, isRaw, file.name);
}

