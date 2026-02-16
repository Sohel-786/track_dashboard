"use client";

import { useEffect, useState, useMemo } from "react";
import DashboardCard from "@/components/DashboardCard";
import {
  Plus,
  Search,
  LayoutDashboard,
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

const SkeletonCard = () => (
  <div className="bg-card rounded-2xl border border-border overflow-hidden h-[350px] animate-pulse">
    <div className="bg-muted h-44 w-full" />
    <div className="p-5 space-y-3">
      <div className="h-6 bg-muted rounded-lg w-2/3" />
      <div className="h-16 bg-muted rounded-lg w-full" />
      <div className="pt-3 border-t border-border mt-auto">
        <div className="h-8 bg-muted rounded-xl w-full" />
      </div>
    </div>
  </div>
);

export default function Home() {
  const [dashboards, setDashboards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchDashboards();
  }, []);

  const fetchDashboards = async () => {
    try {
      const res = await fetch("/api/dashboards");
      const data = await res.json();
      setDashboards(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch dashboards", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredDashboards = useMemo(
    () =>
      dashboards.filter(
        (dash) =>
          dash.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          dash.description?.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [dashboards, searchQuery],
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background">
      <div className="container mx-auto px-4 py-8 max-w-[1400px]">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-[0.2em] border border-primary/20"
            >
              <span>Dashboard Management</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-3xl md:text-5xl font-black tracking-tight text-foreground leading-tight"
            >
              Your{" "}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-blue-600 to-indigo-600 italic">
                Dashboards.
              </span>
            </motion.h1>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 15 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <Link
              href="/create"
              className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground font-black rounded-xl shadow-xl shadow-primary/20 hover:shadow-primary/30 hover:-translate-y-0.5 transition-all active:scale-95 group cursor-pointer text-sm"
            >
              <Plus className="mr-2 h-4 w-4 group-hover:rotate-90 transition-transform" />
              New Entry
            </Link>
          </motion.div>
        </div>

        {/* Search & Stats Bar */}
        <div className="sticky top-20 z-30 bg-background/80 backdrop-blur-xl py-4 mb-10 border-b border-border -mx-4 px-4">
          <div className="max-w-[1400px] mx-auto flex items-center gap-4">
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                placeholder="Search dashboards..."
                className="w-full pl-11 pr-4 py-3 bg-card/50 border border-border rounded-xl focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all shadow-sm group-hover:border-primary/50 text-sm font-medium"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="hidden sm:flex items-center gap-3 px-4 py-2.5 bg-card/50 border border-border rounded-xl shadow-sm h-[46px]">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <LayoutDashboard className="w-4 h-4" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Assets</span>
                <span className="text-sm font-black">{dashboards.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard Grid */}
        <AnimatePresence mode="popLayout">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : filteredDashboards.length > 0 ? (
            <motion.div
              layout
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            >
              {filteredDashboards.map((dash) => (
                <DashboardCard key={dash._id} dashboard={dash} />
              ))}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-card border-2 border-dashed border-border rounded-3xl p-16 text-center max-w-2xl mx-auto shadow-xl"
            >
              <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                <LayoutDashboard className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-black mb-3 text-foreground">
                No dashboards found
              </h2>
              <p className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto leading-relaxed">
                Your dashboard repository is currently empty.
              </p>
              <Link
                href="/create"
                className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground font-black rounded-xl shadow-lg hover:shadow-primary/40 hover:-translate-y-0.5 transition-all"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add First Entry
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
