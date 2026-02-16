'use server';

import { uploadFile } from '@/lib/cloudinary-server';
import connectDB from '@/lib/mongodb';
import Dashboard from '@/models/Dashboard';
import { revalidatePath } from 'next/cache';

export async function saveDashboardAction(formData: FormData) {
    try {
        // Ensure DB connection with a retry logic for robustness
        let attempts = 0;
        while (attempts < 3) {
            try {
                await connectDB();
                break;
            } catch (err) {
                attempts++;
                if (attempts === 3) throw err;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        const id = formData.get('id') as string;
        const title = formData.get('title') as string;
        const description = formData.get('description') as string;

        // Existing URLs (from initialData)
        let imageOneUrl = formData.get('existingImageOne') as string || '';
        let imageTwoUrl = formData.get('existingImageTwo') as string || '';
        let excelFileUrl = formData.get('existingExcelFile') as string || '';
        let excelFileName = formData.get('existingExcelFileName') as string || '';

        // Files - check if they exist and are not empty
        const imageOne = formData.get('imageOne') as File | null;
        const imageTwo = formData.get('imageTwo') as File | null;
        const excelFile = formData.get('excelFile') as File | null;

        const uploadPromises = [];

        if (imageOne && imageOne.size > 0) {
            const buffer = Buffer.from(await imageOne.arrayBuffer());
            const fileBase64 = `data:${imageOne.type};base64,${buffer.toString('base64')}`;
            uploadPromises.push(uploadFile(fileBase64, false, imageOne.name).then(url => {
                imageOneUrl = url;
            }));
        }

        if (imageTwo && imageTwo.size > 0) {
            const buffer = Buffer.from(await imageTwo.arrayBuffer());
            const fileBase64 = `data:${imageTwo.type};base64,${buffer.toString('base64')}`;
            uploadPromises.push(uploadFile(fileBase64, false, imageTwo.name).then(url => {
                imageTwoUrl = url;
            }));
        }

        if (excelFile && excelFile.size > 0) {
            const buffer = Buffer.from(await excelFile.arrayBuffer());
            const fileBase64 = `data:${excelFile.type};base64,${buffer.toString('base64')}`;
            uploadPromises.push(uploadFile(fileBase64, true, excelFile.name).then(url => {
                excelFileUrl = url;
                excelFileName = excelFile.name;
            }));
        }

        // Wait for all uploads to complete
        if (uploadPromises.length > 0) {
            await Promise.all(uploadPromises);
        }

        const dashboardData = {
            title,
            description,
            imageOne: imageOneUrl,
            imageTwo: imageTwoUrl,
            excelFile: excelFileUrl,
            excelFileName: excelFileName,
        };

        if (id && id !== 'undefined' && id !== 'null') {
            const updated = await Dashboard.findByIdAndUpdate(id, dashboardData, { new: true });
            if (!updated) throw new Error('Dashboard not found');
        } else {
            await Dashboard.create(dashboardData);
        }

        revalidatePath('/');
        return { success: true };
    } catch (error: any) {
        console.error('Save error detailed:', error);
        return {
            success: false,
            error: error.message || 'Failed to save dashboard. Please check your connection and try again.'
        };
    }
}

export async function deleteDashboardAction(id: string) {
    try {
        await connectDB();
        const deleted = await Dashboard.findByIdAndDelete(id);
        if (!deleted) throw new Error('Dashboard not found');
        revalidatePath('/');
        return { success: true };
    } catch (error: any) {
        console.error('Delete error:', error);
        return { success: false, error: error.message || 'Failed to delete entry' };
    }
}

