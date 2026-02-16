'use client';

import Link from 'next/link';
import { LayoutDashboard, Plus } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './ThemeToggle';
import { motion } from 'framer-motion';

const Navbar = () => {
    const pathname = usePathname();

    return (
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/60 backdrop-blur-xl">
            <div className="container mx-auto px-4 h-14 flex items-center justify-between max-w-[1400px]">
                <div className="flex items-center space-x-6">
                    <Link href="/" className="flex items-center space-x-2 group">
                        <motion.div
                            whileHover={{ rotate: 10, scale: 1.05 }}
                            className="bg-primary p-1.5 rounded-xl shadow-md shadow-primary/10"
                        >
                            <LayoutDashboard className="w-4 h-4 text-primary-foreground" />
                        </motion.div>
                        <span className="font-black text-lg tracking-tighter text-foreground">
                            TRACEDASH
                        </span>
                    </Link>

                    <nav className="hidden md:flex items-center space-x-4">
                        <Link
                            href="/"
                            className={cn(
                                "text-[11px] font-black uppercase tracking-widest transition-all hover:text-primary",
                                pathname === "/" ? "text-primary" : "text-muted-foreground"
                            )}
                        >
                            Dashboards
                        </Link>
                    </nav>
                </div>

                <div className="flex items-center space-x-3">
                    <ThemeToggle />
                    <div className="h-4 w-px bg-border/60 hidden sm:block" />
                    <Link
                        href="/create"
                        className={cn(
                            "inline-flex items-center justify-center rounded-lg px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-all hover:-translate-y-0.5",
                            pathname === "/create"
                                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                                : "bg-card text-foreground hover:bg-secondary border border-border/80"
                        )}
                    >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        New Entry
                    </Link>
                </div>
            </div>
        </header>
    );
};

export default Navbar;
