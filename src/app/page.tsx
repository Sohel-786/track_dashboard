import DashboardAnalytics from "@/components/dashboard/DashboardAnalytics";
import { PageHeader, PageShell } from "@/components/layout/PageShell";

export default function HomePage() {
  return (
    <PageShell>
      <PageHeader
        title="Dashboard"
        description="Day-wise progress with daily targets — today, week, month, year, and custom ranges."
      />
      <DashboardAnalytics />
    </PageShell>
  );
}
