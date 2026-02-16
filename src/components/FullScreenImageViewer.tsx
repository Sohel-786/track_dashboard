import { useRef, useEffect, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { X, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;

export interface FullScreenImageViewerProps {
    isOpen: boolean;
    onClose: () => void;
    imageSrc: string | null;
    alt?: string;
}

export function FullScreenImageViewer({
    isOpen,
    onClose,
    imageSrc,
    alt = "Image",
}: FullScreenImageViewerProps) {
    const [zoom, setZoom] = useState(1);
    const containerRef = useRef<HTMLDivElement>(null);

    const zoomIn = useCallback(() => {
        setZoom((z: number) => {
            const next = ZOOM_LEVELS.find((level) => level > z) ?? MAX_ZOOM;
            return Math.min(next, MAX_ZOOM);
        });
    }, []);

    const zoomOut = useCallback(() => {
        setZoom((z: number) => {
            const prev = [...ZOOM_LEVELS].reverse().find((level) => level < z) ?? MIN_ZOOM;
            return Math.max(prev, MIN_ZOOM);
        });
    }, []);


    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) return;
            e.preventDefault();
            if (e.deltaY < 0) {
                zoomIn();
            } else {
                zoomOut();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("wheel", handleWheel, { passive: false });
        document.body.style.overflow = "hidden";

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("wheel", handleWheel);
            document.body.style.overflow = "unset";
        };
    }, [isOpen, onClose, zoomIn, zoomOut]);

    useEffect(() => {
        if (isOpen) setZoom(1);
    }, [isOpen]);

    if (!isOpen) return null;

    const viewerContent = (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] flex flex-col bg-black/95 transition-opacity duration-300"
                role="dialog"
                aria-modal="true"
            >
                {/* Top bar */}
                <div className="flex-none flex items-center justify-between px-6 py-4 bg-black/40 backdrop-blur-md border-b border-white/10 z-10">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={zoomOut}
                            disabled={zoom <= MIN_ZOOM}
                            className="text-white p-2 rounded-full hover:bg-white/10 disabled:opacity-30 transition-all cursor-pointer"
                            title="Zoom out"
                        >
                            <ZoomOut size={20} />
                        </button>
                        <span className="text-white text-sm font-semibold min-w-[3rem] text-center font-mono">
                            {Math.round(zoom * 100)}%
                        </span>
                        <button
                            onClick={zoomIn}
                            disabled={zoom >= MAX_ZOOM}
                            className="text-white p-2 rounded-full hover:bg-white/10 disabled:opacity-30 transition-all cursor-pointer"
                            title="Zoom in"
                        >
                            <ZoomIn size={20} />
                        </button>
                        <span className="text-white/40 text-[10px] uppercase tracking-widest hidden md:block">Scroll to zoom • Drag to pan</span>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="text-white p-2 rounded-full hover:bg-white/20 transition-all group cursor-pointer"
                            title="Close (Esc)"
                        >
                            <X size={24} className="group-hover:rotate-90 transition-transform duration-300" />
                        </button>
                    </div>
                </div>

                {/* Image area */}
                <div
                    ref={containerRef}
                    className="flex-1 min-h-0 overflow-hidden flex items-center justify-center p-4 cursor-grab active:cursor-grabbing"
                >
                    {imageSrc ? (
                        <motion.img
                            key={imageSrc}
                            src={imageSrc}
                            alt={alt}
                            drag
                            dragConstraints={containerRef}
                            dragElastic={0.1}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: zoom, opacity: 1 }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className={cn("object-contain select-none rounded shadow-2xl max-w-[90vw] max-h-[80vh]")}
                            draggable={false}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : null}
                </div>
            </motion.div>
        </AnimatePresence>
    );

    if (typeof document !== "undefined") {
        return createPortal(viewerContent, document.body);
    }

    return viewerContent;
}

