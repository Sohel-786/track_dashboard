'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { Save, Loader2, ArrowLeft } from 'lucide-react';
import FileUpload from './FileUpload';
import { saveDashboardAction, deleteDashboardAction } from '@/app/actions';
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
            toast.error('Title is required');
            return;
        }

        setLoading(true);

        try {
            const submitData = new FormData();

            if (initialData?._id) submitData.append('id', initialData._id);
            submitData.append('title', formData.title);
            submitData.append('description', formData.description);

            if (initialData?.imageOne) submitData.append('existingImageOne', initialData.imageOne);
            if (initialData?.imageTwo) submitData.append('existingImageTwo', initialData.imageTwo);
            if (initialData?.excelFile) submitData.append('existingExcelFile', initialData.excelFile);
            if (initialData?.excelFileName) submitData.append('existingExcelFileName', initialData.excelFileName);

            if (files.imageOne) submitData.append('imageOne', files.imageOne);
            if (files.imageTwo) submitData.append('imageTwo', files.imageTwo);
            if (files.excelFile) submitData.append('excelFile', files.excelFile);

            const result = await saveDashboardAction(submitData);

            if (!result.success) throw new Error(result.error);

            toast.success(initialData ? 'Updated successfully!' : 'Created successfully!');
            router.push('/');
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!initialData?._id || !confirm('Permanently delete this entry?')) return;

        setLoading(true);
        try {
            const result = await deleteDashboardAction(initialData._id);
            if (result.success) {
                toast.success('Deleted successfully');
                router.push('/');
            } else {
                toast.error(result.error || 'Delete failed');
            }
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto py-8 px-4"
        >
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-2xl font-black text-foreground tracking-tight">
                    {initialData ? 'Edit Entry' : 'New Entry'}
                </h1>
                <button
                    onClick={() => router.back()}
                    className="flex items-center text-xs font-bold text-muted-foreground hover:text-primary transition-all group"
                >
                    <ArrowLeft className="w-3.5 h-3.5 mr-1.5 group-hover:-translate-x-1 transition-transform" />
                    Back
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 bg-card p-8 rounded-2xl border border-border/80 shadow-xl">
                <div className="space-y-5">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-foreground/60 uppercase tracking-widest ml-1">Title</label>
                        <input
                            type="text"
                            placeholder="Dashboard title"
                            className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-primary outline-none transition-all text-sm font-bold shadow-sm"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-foreground/60 uppercase tracking-widest ml-1">Description</label>
                        <textarea
                            placeholder="Internal description"
                            rows={4}
                            className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-primary outline-none transition-all text-sm font-medium shadow-sm leading-relaxed"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        />
                    </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6 pt-2">
                    <div className="space-y-3">
                        <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Visuals</h3>
                        <div className="space-y-3">
                            <FileUpload
                                label="Primary Image"
                                accept="image/*"
                                type="image"
                                onFileSelect={(file) => setFiles(prev => ({ ...prev, imageOne: file }))}
                                currentFile={initialData?.imageOne}
                            />
                            <FileUpload
                                label="Secondary Image"
                                accept="image/*"
                                type="image"
                                onFileSelect={(file) => setFiles(prev => ({ ...prev, imageTwo: file }))}
                                currentFile={initialData?.imageTwo}
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Data Source</h3>
                        <FileUpload
                            label="Spreadsheet"
                            accept=".xlsx, .xls"
                            type="excel"
                            onFileSelect={(file) => setFiles(prev => ({ ...prev, excelFile: file }))}
                            currentFile={initialData?.excelFile}
                        />
                    </div>
                </div>

                <div className="pt-6 flex flex-col sm:flex-row gap-3 border-t border-border/40">
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 bg-primary text-primary-foreground py-3.5 rounded-xl font-black text-sm flex items-center justify-center space-x-2 shadow-lg hover:-translate-y-0.5 transition-all active:scale-[0.98] disabled:opacity-70 cursor-pointer"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Saving...</span>
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                <span>Save</span>
                            </>
                        )}
                    </button>

                    {initialData && (
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={loading}
                            className="px-6 py-3.5 rounded-xl font-bold text-sm bg-destructive/5 text-destructive hover:bg-destructive hover:text-white transition-all border border-destructive/10 cursor-pointer disabled:opacity-50"
                        >
                            Delete
                        </button>
                    )}
                </div>
            </form>
        </motion.div>
    );
};

export default DashboardForm;
