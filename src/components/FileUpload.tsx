'use client';

import { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, FileSpreadsheet, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadProps {
    label: string;
    accept: string;
    onFileSelect: (file: File | null) => void;
    type: 'image' | 'excel';
    currentFile?: string | null;
}

const FileUpload = ({ label, accept, onFileSelect, type, currentFile }: FileUploadProps) => {
    const [dragActive, setDragActive] = useState(false);
    const [preview, setPreview] = useState<string | null>(type === 'image' ? currentFile || null : null);
    const [fileName, setFileName] = useState<string | null>(type === 'excel' ? (currentFile ? 'Existing Excel File' : null) : null);
    const inputRef = useRef<HTMLInputElement>(null);


    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFile(e.dataTransfer.files[0]);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            processFile(e.target.files[0]);
        }
    };

    const processFile = (file: File) => {
        onFileSelect(file);
        setFileName(file.name);
        if (type === 'image') {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const clearFile = () => {
        onFileSelect(null);
        setPreview(null);
        setFileName(null);
        if (inputRef.current) inputRef.current.value = '';
    };

    return (
        <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground/80">{label}</label>
            <div
                className={cn(
                    "relative group cursor-pointer rounded-xl border-2 border-dashed transition-all duration-200 min-h-[140px] flex flex-col items-center justify-center p-4",
                    dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                    (preview || fileName) ? "border-primary bg-primary/5" : "bg-card"
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
            >
                <input
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    accept={accept}
                    onChange={handleChange}
                />

                {preview ? (
                    <div className="relative w-full h-32">
                        <img src={preview} alt="Preview" className="w-full h-full object-cover rounded-lg" />
                        <button
                            onClick={(e) => { e.stopPropagation(); clearFile(); }}
                            className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-lg"
                        >
                            <X size={14} />
                        </button>
                    </div>
                ) : fileName ? (
                    <div className="flex flex-col items-center space-y-2">
                        <div className="p-3 bg-green-500/10 rounded-full">
                            <FileSpreadsheet className="w-8 h-8 text-green-600" />
                        </div>
                        <span className="text-sm font-medium text-foreground truncate max-w-[200px]">{fileName}</span>
                        <button
                            onClick={(e) => { e.stopPropagation(); clearFile(); }}
                            className="text-xs text-red-500 hover:underline"
                        >
                            Remove
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center space-y-2 text-muted-foreground group-hover:text-primary transition-colors">
                        {type === 'image' ? <ImageIcon className="w-8 h-8" /> : <Upload className="w-8 h-8" />}
                        <div className="text-center">
                            <p className="text-sm font-medium">Click or drag to upload</p>
                            <p className="text-xs">{type === 'image' ? 'JPG, PNG, WebP' : 'XLSX, XLS'}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FileUpload;
