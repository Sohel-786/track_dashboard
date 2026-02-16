'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import DashboardForm from '@/components/DashboardForm';
import { Loader2 } from 'lucide-react';

export default function EditPage() {
    const params = useParams();
    const id = params.id;
    const [dashboard, setDashboard] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (id) {
            fetch(`/api/dashboards/${id}`)
                .then(res => res.json())
                .then(data => {
                    setDashboard(data);
                    setLoading(false);
                })
                .catch(err => {
                    console.error(err);
                    setLoading(false);
                });
        }
    }, [id]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh]">
                <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground font-medium">Loading dashboard data...</p>
            </div>
        );
    }

    if (!dashboard || dashboard.error) {
        return (
            <div className="text-center py-20 font-bold text-red-500">
                Dashboard not found!
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4">
            <DashboardForm initialData={dashboard} />
        </div>
    );
}
