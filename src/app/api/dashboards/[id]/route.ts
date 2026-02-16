import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Dashboard from '@/models/Dashboard';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await connectDB();
        const dashboard = await Dashboard.findById(id);
        if (!dashboard) {
            return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 });
        }
        return NextResponse.json(dashboard);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        await connectDB();
        const updatedDashboard = await Dashboard.findByIdAndUpdate(id, body, {
            new: true,
        });
        if (!updatedDashboard) {
            return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 });
        }
        return NextResponse.json(updatedDashboard);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await connectDB();
        const deletedDashboard = await Dashboard.findByIdAndDelete(id);
        if (!deletedDashboard) {
            return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 });
        }
        return NextResponse.json({ message: 'Dashboard deleted successfully' });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
