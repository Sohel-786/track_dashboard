'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { Save, Loader2, ArrowLeft } from 'lucide-react';
import FileUpload from './FileUpload';
import { uploadToCloudinaryAction } from '@/app/actions';
import { motion } from 'framer-motion';


const DashboardForm = ({ initialData }: { initialData?: any }) => {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: initialData?.title || '',
        description: initialData?.description || '',
    });

    const [files, setFiles] = useState<{
        imageOne: File | null;
        imageTwo: File | null;
        excelFile: File | null;
    }>({
        imageOne: null,
        imageTwo: null,
        excelFile: null,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.title.trim()) {
            toast.error('Dashboard Title is required');
            return;
        }

        setLoading(true);


        try {
            const uploadPromises = [];
            let imageOneUrl = initialData?.imageOne || '';
            let imageTwoUrl = initialData?.imageTwo || '';
            let excelFileUrl = initialData?.excelFile || '';
            let excelFileName = initialData?.excelFileName || '';

            if (files.imageOne) {
                const formData = new FormData();
                formData.append('file', files.imageOne);
                uploadPromises.push(uploadToCloudinaryAction(formData).then((url: string) => imageOneUrl = url));
            }
            if (files.imageTwo) {
                const formData = new FormData();
                formData.append('file', files.imageTwo);
                uploadPromises.push(uploadToCloudinaryAction(formData).then((url: string) => imageTwoUrl = url));
            }
            if (files.excelFile) {
                const formData = new FormData();
                formData.append('file', files.excelFile);
                formData.append('isRaw', 'true');
                uploadPromises.push(uploadToCloudinaryAction(formData).then((url: string) => {
                    excelFileUrl = url;
                    excelFileName = files.excelFile!.name;
                }));
            }


            await Promise.all(uploadPromises);

            const payload = {
                ...formData,
                imageOne: imageOneUrl,
                imageTwo: imageTwoUrl,
                excelFile: excelFileUrl,
                excelFileName: excelFileName,
            };

            const res = await fetch(initialData ? `/api/dashboards/${initialData._id}` : '/api/dashboards', {
                method: initialData ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error('Failed to save dashboard');

            toast.success(initialData ? 'Dashboard updated!' : 'Dashboard created!');
            router.push('/');
            router.refresh();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="max-w-4xl mx-auto py-8 px-4"
        >
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">
                        {initialData ? 'Edit Dashboard' : 'Create New Dashboard'}
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Fill in the details below to track your dashboard.
                    </p>
                </div>
                <button
                    onClick={() => router.back()}
                    className="flex items-center text-sm font-semibold text-muted-foreground hover:text-primary transition-colors cursor-pointer group"
                >
                    <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" />
                    Back to Registry
                </button>

            </div>

            <form onSubmit={handleSubmit} className="space-y-8 bg-card p-10 rounded-3xl border border-border shadow-xl">
                <div className="grid grid-cols-1 gap-8">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-foreground">
                                Dashboard Title <span className="text-destructive">*</span>
                            </label>

                            <input
                                type="text"
                                placeholder="e.g. Q4 Sales Performance Analysis"
                                className="w-full px-5 py-4 rounded-2xl bg-background border border-border focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all shadow-sm"
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-foreground">Detailed Description</label>
                            <textarea
                                placeholder="Outline the key metrics, data sources, and intended audience..."
                                rows={5}
                                className="w-full px-5 py-4 rounded-2xl bg-background border border-border focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all resize-none shadow-sm"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-foreground/70 uppercase tracking-widest">Visual Previews</h3>
                            <FileUpload
                                label="Primary View"
                                accept="image/*"
                                type="image"
                                onFileSelect={(file) => setFiles(prev => ({ ...prev, imageOne: file }))}
                                currentFile={initialData?.imageOne}
                            />
                            <FileUpload
                                label="Secondary View"
                                accept="image/*"
                                type="image"
                                onFileSelect={(file) => setFiles(prev => ({ ...prev, imageTwo: file }))}
                                currentFile={initialData?.imageTwo}
                            />
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-foreground/70 uppercase tracking-widest">Source Data</h3>
                            <FileUpload
                                label="Excel / Spreadsheet File"
                                accept=".xlsx, .xls"
                                type="excel"
                                onFileSelect={(file) => setFiles(prev => ({ ...prev, excelFile: file }))}
                                currentFile={initialData?.excelFile}
                            />
                            <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
                                <p className="text-xs text-primary font-medium flex gap-2">
                                    <span className="font-bold">Pro Tip:</span>
                                    Uploading the raw spreadsheet allows other users to download and analyze the data directly.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pt-8 flex flex-col sm:flex-row gap-4 border-t border-border">
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground py-5 rounded-2xl font-black text-lg flex items-center justify-center space-x-3 shadow-xl shadow-primary/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 cursor-pointer"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-6 h-6 animate-spin" />
                                <span>Synchronizing...</span>
                            </>
                        ) : (
                            <>
                                <Save className="w-6 h-6" />
                                <span>{initialData ? 'Update Dashboard' : 'Publish Dashboard'}</span>
                            </>
                        )}
                    </button>

                    {initialData && (
                        <button
                            type="button"
                            onClick={async () => {
                                if (confirm('Permanently delete this entry?')) {
                                    const res = await fetch(`/api/dashboards/${initialData._id}`, { method: 'DELETE' });
                                    if (res.ok) {
                                        toast.success('Deleted');
                                        router.push('/');
                                        router.refresh();
                                    }
                                }
                            }}
                            className="px-8 py-5 rounded-2xl font-bold bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-all border border-destructive/20 cursor-pointer"
                        >
                            Delete Entry
                        </button>
                    )}
                </div>

            </form>

        </motion.div>
    );
};

export default DashboardForm;
