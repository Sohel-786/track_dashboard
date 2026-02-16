import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Dashboard from '@/models/Dashboard';

export async function GET() {
    try {
        await connectDB();
        const dashboards = await Dashboard.find({}).sort({ createdAt: -1 });
        return NextResponse.json(dashboards);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        await connectDB();
        const newDashboard = await Dashboard.create(body);
        return NextResponse.json(newDashboard, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
