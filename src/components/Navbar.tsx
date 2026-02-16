'use client';

import Link from 'next/link';
import { LayoutDashboard, PlusCircle } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './ThemeToggle';

const Navbar = () => {
    const pathname = usePathname();

    return (
        <header className="sticky top-0 z-50 w-full glass border-b border-border transition-all">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                <Link href="/" className="flex items-center space-x-2 group">
                    <div className="bg-primary p-2 rounded-lg group-hover:rotate-12 transition-transform">
                        <LayoutDashboard className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-600">
                        TraceDash
                    </span>
                </Link>

                <nav className="flex items-center space-x-6">
                    <Link
                        href="/"
                        className={cn(
                            "text-sm font-medium transition-colors hover:text-primary flex items-center space-x-1",
                            pathname === "/" ? "text-primary" : "text-muted-foreground"
                        )}
                    >
                        <span>Dashboards</span>
                    </Link>
                    <ThemeToggle />
                    <Link
                        href="/create"
                        className={cn(
                            "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                            pathname === "/create"
                                ? "bg-primary text-primary-foreground shadow"
                                : "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border"
                        )}
                    >
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Create
                    </Link>
                </nav>
            </div>
        </header>
    );
};

export default Navbar;
