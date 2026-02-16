'use client';

import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './ThemeToggle';
import { motion } from 'framer-motion';

const Navbar = () => {
    const pathname = usePathname();

    return (
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/60 backdrop-blur-xl">
            <div className="container mx-auto px-4 h-14 flex items-center justify-between max-w-[1400px] relative">
                <div className="flex items-center">
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
                </div>

                <nav className="hidden md:flex items-center space-x-4 absolute left-1/2 -translate-x-1/2">
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

                <div className="flex items-center space-x-3">
                    <ThemeToggle />
                </div>
            </div>
        </header>
    );
};

export default Navbar;
