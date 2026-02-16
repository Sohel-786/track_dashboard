'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, Download, Edit, Maximize2, Trash2, Calendar, ChevronRight } from 'lucide-react';

import { FullScreenImageViewer } from './FullScreenImageViewer';
import { IDashboard } from '@/models/Dashboard';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface DashboardCardProps {
    dashboard: IDashboard & { _id: string; createdAt?: string };
}

const DashboardCard = ({ dashboard }: DashboardCardProps) => {
    const router = useRouter();
    const [viewerOpen, setViewerOpen] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);

    const handleEdit = () => {
        router.push(`/edit/${dashboard._id}`);
    };

    const openImage = (url: string) => {
        setSelectedImage(url);
        setViewerOpen(true);
    };

    const handleDownload = async () => {
        if (!dashboard.excelFile) return;
        setIsDownloading(true);
        try {
            const response = await fetch(dashboard.excelFile);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = dashboard.excelFileName || 'report.xlsx';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast.success('Download started');
        } catch (error) {
            console.error('Download failed:', error);
            window.open(dashboard.excelFile, '_blank');
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this?')) return;
        try {
            const res = await fetch(`/api/dashboards/${dashboard._id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success('Deleted');
                window.location.reload();
            }
        } catch (err) {
            toast.error('Failed to delete');
        }
    };

    const formattedDate = dashboard.createdAt
        ? new Date(dashboard.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'Recent';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="group flex flex-col bg-card rounded-2xl border border-border/50 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300"
        >
            {/* Visual Header */}
            <div className="relative h-48 overflow-hidden bg-muted">
                <div className="absolute inset-0 grid grid-cols-2 gap-px bg-border/20">
                    <div
                        className="relative h-full cursor-zoom-in group/img overflow-hidden"
                        onClick={() => dashboard.imageOne && openImage(dashboard.imageOne)}
                    >
                        {dashboard.imageOne ? (
                            <img
                                src={dashboard.imageOne}
                                alt="Metric View"
                                className="w-full h-full object-cover transition-transform duration-700 group-hover/img:scale-110"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-secondary/30 text-[9px] text-muted-foreground uppercase tracking-widest font-black">No Image</div>
                        )}
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                            <Maximize2 className="text-white w-5 h-5" />
                        </div>
                    </div>
                    <div
                        className="relative h-full cursor-zoom-in group/img overflow-hidden"
                        onClick={() => dashboard.imageTwo && openImage(dashboard.imageTwo)}
                    >
                        {dashboard.imageTwo ? (
                            <img
                                src={dashboard.imageTwo}
                                alt="Support View"
                                className="w-full h-full object-cover transition-transform duration-700 group-hover/img:scale-110"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-secondary/30 text-[9px] text-muted-foreground uppercase tracking-widest font-black">No Image</div>
                        )}
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                            <Maximize2 className="text-white w-5 h-5" />
                        </div>
                    </div>
                </div>

                {/* Date Tag */}
                <div className="absolute top-3 left-3 inline-flex items-center px-2 py-1 rounded-lg bg-background/80 backdrop-blur-md border border-border/50 text-[9px] font-black uppercase tracking-widest text-primary shadow-sm">
                    <Calendar className="w-2.5 h-2.5 mr-1" />
                    {formattedDate}
                </div>

                {/* Delete Button */}
                <button
                    onClick={handleDelete}
                    className="absolute top-3 right-3 p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all cursor-pointer shadow-lg border border-red-100/50"
                >
                    <Trash2 size={14} />
                </button>
            </div>

            {/* Detailed Content */}
            <div className="p-5 flex flex-col flex-1">
                <h3 className="font-black text-lg text-foreground tracking-tight leading-snug mb-3 group-hover:text-primary transition-colors line-clamp-1">
                    {dashboard.title || 'Untitled'}
                </h3>

                <p className="text-xs text-muted-foreground line-clamp-2 mb-6 flex-1 leading-relaxed font-medium">
                    {dashboard.description || 'No description provided.'}
                </p>

                <div className="space-y-3">
                    {dashboard.excelFile ? (
                        <div className="flex items-center gap-2.5 p-3 bg-primary/5 rounded-xl border border-primary/10">
                            <div className="p-2 bg-green-500/10 rounded-lg">
                                <FileSpreadsheet className="w-4 h-4 text-green-600" />
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-[10px] font-bold text-foreground truncate">
                                    {dashboard.excelFileName || 'data.xlsx'}
                                </span>
                            </div>
                            <button
                                onClick={handleDownload}
                                disabled={isDownloading}
                                className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-all cursor-pointer"
                            >
                                <Download size={14} className={cn(isDownloading && "animate-bounce")} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center py-3 bg-muted/20 rounded-xl border border-dashed border-border text-[9px] font-black uppercase tracking-widest text-muted-foreground italic">
                            No File
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleEdit}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-foreground text-background hover:bg-foreground/90 transition-all rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg cursor-pointer"
                        >
                            <Edit size={12} />
                            Modify
                        </button>
                        <button
                            onClick={handleEdit}
                            className="p-2.5 bg-secondary text-foreground hover:bg-secondary/80 transition-all rounded-xl cursor-pointer"
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            </div>

            <FullScreenImageViewer
                isOpen={viewerOpen}
                onClose={() => setViewerOpen(false)}
                imageSrc={selectedImage}
                alt={dashboard.title || 'Preview'}
            />
        </motion.div>
    );
};

export default DashboardCard;
