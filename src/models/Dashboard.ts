import mongoose, { Schema, model, models } from 'mongoose';

export interface IDashboard {
    title?: string;
    description?: string;
    imageOne?: string;
    imageTwo?: string;
    excelFile?: string;
    excelFileName?: string;
    createdAt?: Date;
}

const DashboardSchema = new Schema<IDashboard>(
    {
        title: { type: String, default: '' },
        description: { type: String, default: '' },
        imageOne: { type: String, default: '' },
        imageTwo: { type: String, default: '' },
        excelFile: { type: String, default: '' },
        excelFileName: { type: String, default: '' },
    },
    { timestamps: true }
);

const Dashboard = models.Dashboard || model<IDashboard>('Dashboard', DashboardSchema);

export default Dashboard;
