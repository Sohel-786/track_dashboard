'use client';

import { useEffect, useState } from 'react';
import DashboardCard from '@/components/DashboardCard';
import { Loader2, Plus, Search, Filter } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';

export default function Home() {
  const [dashboards, setDashboards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchDashboards();
  }, []);

  const fetchDashboards = async () => {
    try {
      const res = await fetch('/api/dashboards');
      const data = await res.json();
      setDashboards(data);
    } catch (error) {
      console.error('Failed to fetch dashboards', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredDashboards = dashboards.filter(dash =>
    dash.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    dash.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="container mx-auto px-4 py-12 max-w-[1600px]">
      {/* ... Hero Section ... */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
        <div className="space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span>Dashboard Registry</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tight text-foreground">
            Track your <span className="text-primary italic">Insights.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
            A specialized traceability dashboard for managing your analytical assets, spreadsheets, and visual reports in one centralized location.
          </p>
        </div>
        <Link
          href="/create"
          className="inline-flex items-center px-8 py-4 bg-primary text-primary-foreground font-bold rounded-2xl shadow-xl shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-1 transition-all active:scale-95 group cursor-pointer"
        >
          <Plus className="mr-2 h-5 w-5 group-hover:rotate-90 transition-transform" />
          New Entry
        </Link>
      </div>

      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row gap-4 mb-12 items-center">
        <div className="relative flex-1 w-full group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5 group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder="Search by title or description..."
            className="w-full pl-12 pr-4 py-4 bg-card border border-border rounded-2xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all shadow-sm group-hover:border-primary/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button className="flex-1 sm:flex-none inline-flex items-center justify-center px-6 py-4 bg-card border border-border rounded-2xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all shadow-sm cursor-pointer">
            <Filter className="mr-2 h-4 w-4" />
            <span>Filter</span>
          </button>
        </div>
      </div>


      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground font-medium">Loading your dashboards...</p>
        </div>
      ) : filteredDashboards.length > 0 ? (
        <motion.div
          layout
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8"
        >
          {filteredDashboards.map((dash) => (
            <DashboardCard
              key={dash._id}
              dashboard={dash}
            />
          ))}
        </motion.div>

      ) : (
        <div className="bg-card border-2 border-dashed border-border rounded-3xl p-12 text-center max-w-2xl mx-auto shadow-sm">
          <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
            <Plus className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-2">No dashboards found</h2>
          <p className="text-muted-foreground mb-8">
            You haven't added any dashboards yet. Start by creating your first entry.
          </p>
          <Link
            href="/create"
            className="inline-flex items-center px-8 py-3 bg-primary text-primary-foreground font-bold rounded-xl shadow-lg transition-all"
          >
            Create Your First Entry
          </Link>
        </div>
      )}
    </div>
  );
}
