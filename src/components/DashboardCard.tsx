import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, Download, ExternalLink, Edit, Maximize2, Trash2 } from 'lucide-react';

import { FullScreenImageViewer } from './FullScreenImageViewer';
import { IDashboard } from '@/models/Dashboard';
import { toast } from 'react-hot-toast';

interface DashboardCardProps {
    dashboard: IDashboard & { _id: string };
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
            link.download = dashboard.excelFileName || 'dashboard_data.xlsx';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast.success('Download started');
        } catch (error) {
            console.error('Download failed:', error);
            // Fallback to direct link if fetch fails (CORS issue)
            window.open(dashboard.excelFile, '_blank');
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this entry?')) return;
        try {
            const res = await fetch(`/api/dashboards/${dashboard._id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success('Deleted successfully');
                router.refresh();
                // We might need a manual page refresh if refresh() doesn't trigger a re-fetch in our setup
                window.location.reload();
            }
        } catch (err) {
            toast.error('Failed to delete');
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -5 }}
            className="flex flex-col bg-card rounded-2xl border border-border overflow-hidden shadow-sm hover:shadow-premium transition-all duration-300"
        >
            {/* Image Previews */}
            <div className="grid grid-cols-2 gap-1 p-1 h-52">
                {dashboard.imageOne ? (
                    <div
                        className="relative overflow-hidden cursor-zoom-in group/img h-full rounded-tl-xl"
                        onClick={() => openImage(dashboard.imageOne!)}
                    >
                        <img
                            src={dashboard.imageOne}
                            alt="Preview 1"
                            className="w-full h-full object-cover transition-transform duration-700 group-hover/img:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                            <Maximize2 className="text-white w-6 h-6" />
                        </div>
                    </div>
                ) : (
                    <div className="bg-muted flex items-center justify-center text-muted-foreground text-xs rounded-tl-xl italic">No Preview</div>
                )}

                {dashboard.imageTwo ? (
                    <div
                        className="relative overflow-hidden cursor-zoom-in group/img h-full rounded-tr-xl"
                        onClick={() => openImage(dashboard.imageTwo!)}
                    >
                        <img
                            src={dashboard.imageTwo}
                            alt="Preview 2"
                            className="w-full h-full object-cover transition-transform duration-700 group-hover/img:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                            <Maximize2 className="text-white w-6 h-6" />
                        </div>
                    </div>
                ) : (
                    <div className="bg-muted flex items-center justify-center text-muted-foreground text-xs rounded-tr-xl italic">No Preview</div>
                )}
            </div>

            {/* Content */}
            <div className="p-6 flex flex-col flex-1">
                <div className="flex justify-between items-start gap-4 mb-3">
                    <h3 className="font-black text-2xl text-foreground tracking-tight flex-1">
                        {dashboard.title || 'Untitled Dashboard'}
                    </h3>
                    <div className="flex items-center gap-1 shrink-0">
                        <motion.button
                            whileHover={{ scale: 1.1, rotate: 5, backgroundColor: '#ef4444', color: '#ffffff' }}
                            whileTap={{ scale: 0.9, rotate: -5 }}
                            onClick={handleDelete}
                            className="p-2 rounded-lg text-muted-foreground hover:text-white transition-all cursor-pointer"
                            title="Delete"
                        >
                            <Trash2 size={20} />
                        </motion.button>
                    </div>
                </div>


                <p className="text-sm text-muted-foreground line-clamp-3 mb-6 flex-1">
                    {dashboard.description || 'No description available for this dashboard entry.'}
                </p>

                {/* Dashboard Meta */}
                <div className="pt-4 border-t border-border mt-auto">
                    {dashboard.excelFile ? (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-xl border border-border/50">
                                <FileSpreadsheet className="w-5 h-5 text-green-600 dark:text-green-500" />
                                <span className="text-xs font-medium text-foreground truncate flex-1">
                                    {dashboard.excelFileName || 'spreadsheet_data.xlsx'}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={handleEdit}
                                    className="flex items-center justify-center gap-2 py-2.5 px-4 bg-background border border-border hover:bg-secondary text-foreground rounded-xl text-sm font-semibold transition-all shadow-sm group"
                                >
                                    <Edit size={16} className="group-hover:rotate-12 transition-transform" />
                                    <span>Edit</span>
                                </button>
                                <button
                                    onClick={handleDownload}
                                    disabled={isDownloading}
                                    className="flex items-center justify-center gap-2 py-2.5 px-4 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-sm font-semibold transition-all shadow-sm disabled:opacity-50"
                                >
                                    {isDownloading ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <Download size={16} />
                                    )}
                                    <span>Download</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center py-3 bg-muted/30 rounded-xl text-xs text-muted-foreground italic border border-dashed border-border">
                            No associated data file
                        </div>
                    )}
                </div>

            </div>

            <FullScreenImageViewer
                isOpen={viewerOpen}
                onClose={() => setViewerOpen(false)}
                imageSrc={selectedImage}
                alt={dashboard.title || 'Dashboard Preview'}
            />
        </motion.div>
    );
};

export default DashboardCard;

