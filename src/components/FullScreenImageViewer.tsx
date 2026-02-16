'use client';

import { useRef, useEffect, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { X, ZoomIn, ZoomOut, Maximize, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

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
    const [dragConstraints, setDragConstraints] = useState({ left: 0, right: 0, top: 0, bottom: 0 });
    const imgRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const updateConstraints = useCallback(() => {
        if (!imgRef.current || !containerRef.current) return;

        const img = imgRef.current;
        const container = containerRef.current;

        const imgRect = img.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // Calculate how much the image overflows the container at current zoom
        // Note: transform: scale doesn't change offsetWidth/height, so we use getBoundingClientRect
        const overflowX = Math.max(0, imgRect.width - containerRect.width);
        const overflowY = Math.max(0, imgRect.height - containerRect.height);

        setDragConstraints({
            left: -overflowX / 2,
            right: overflowX / 2,
            top: -overflowY / 2,
            bottom: overflowY / 2,
        });
    }, [zoom]);

    useEffect(() => {
        if (isOpen) {
            updateConstraints();
        }
    }, [isOpen, zoom, updateConstraints]);

    const handleZoomIn = () => setZoom(prev => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
    const resetZoom = () => setZoom(1);

    const toggleDoubleTapZoom = () => {
        if (zoom > 1) {
            resetZoom();
        } else {
            setZoom(2.5);
        }
    };

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "+" || e.key === "=") handleZoomIn();
            if (e.key === "-" || e.key === "_") handleZoomOut();
            if (e.key === "0") resetZoom();
        };

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) return;
            e.preventDefault();
            if (e.deltaY < 0) {
                handleZoomIn();
            } else {
                handleZoomOut();
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
    }, [isOpen, onClose]);

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
                className="fixed inset-0 z-[9999] flex flex-col bg-black/98 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
            >
                {/* Header Controls */}
                <div className="flex-none flex items-center justify-between px-6 py-4 bg-black/40 backdrop-blur-xl border-b border-white/5 z-20">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center bg-white/5 rounded-xl border border-white/10 p-1">
                            <button
                                onClick={handleZoomOut}
                                disabled={zoom <= MIN_ZOOM}
                                className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg disabled:opacity-20 transition-all cursor-pointer"
                            >
                                <ZoomOut size={18} />
                            </button>
                            <span className="text-white text-[11px] font-black min-w-[3.5rem] text-center font-mono">
                                {Math.round(zoom * 100)}%
                            </span>
                            <button
                                onClick={handleZoomIn}
                                disabled={zoom >= MAX_ZOOM}
                                className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg disabled:opacity-20 transition-all cursor-pointer"
                            >
                                <ZoomIn size={18} />
                            </button>
                        </div>

                        <button
                            onClick={resetZoom}
                            className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-white/70 hover:text-white transition-all cursor-pointer"
                            title="Reset Zoom"
                        >
                            <RotateCcw size={16} />
                        </button>
                    </div>

                    <div className="flex items-center gap-6">
                        <span className="hidden md:block text-[10px] font-black uppercase tracking-[0.2em] text-white/30">
                            Double tap to zoom • Drag to pan
                        </span>
                        <button
                            onClick={onClose}
                            className="p-3 bg-white/10 hover:bg-destructive hover:text-white rounded-xl text-white transition-all group cursor-pointer"
                        >
                            <X size={20} className="group-hover:rotate-90 transition-transform duration-300" />
                        </button>
                    </div>
                </div>

                {/* Main Viewport */}
                <div
                    ref={containerRef}
                    className="flex-1 relative overflow-hidden flex items-center justify-center bg-transparent cursor-grab active:cursor-grabbing p-4 md:p-12"
                    onClick={onClose}
                >
                    <AnimatePresence mode="wait">
                        {imageSrc && (
                            <motion.img
                                ref={imgRef}
                                key={imageSrc}
                                src={imageSrc}
                                alt={alt}
                                drag={zoom > 1}
                                dragConstraints={dragConstraints}
                                dragElastic={0.05}
                                dragMomentum={true}
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    toggleDoubleTapZoom();
                                }}
                                onClick={(e) => e.stopPropagation()}
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: zoom, opacity: 1 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                                transition={{
                                    type: "spring",
                                    damping: 30,
                                    stiffness: 300,
                                    mass: 0.8
                                }}
                                className={cn(
                                    "max-w-full max-h-full object-contain select-none shadow-[0_0_80px_rgba(0,0,0,0.5)]",
                                    zoom > 1 ? "rounded-none" : "rounded-lg"
                                )}
                                draggable={false}
                                onLoad={updateConstraints}
                            />
                        )}
                    </AnimatePresence>
                </div>

                {/* Status Footer */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-white/5 backdrop-blur-md rounded-full border border-white/10 text-white/40 text-[9px] font-black uppercase tracking-[0.3em] pointer-events-none z-10">
                    {alt} • Production Viewer v2.1
                </div>
            </motion.div>
        </AnimatePresence>
    );

    if (typeof document !== "undefined") {
        return createPortal(viewerContent, document.body);
    }

    return viewerContent;
}
