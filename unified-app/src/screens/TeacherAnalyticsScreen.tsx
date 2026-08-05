import { ComingSoonScreen } from "../components/ComingSoonScreen";

export function TeacherAnalyticsScreen() {
  return (
    <ComingSoonScreen
      icon="bar-chart-outline"
      title="Analytics"
      description="Per-student and per-class performance analytics are coming soon."
      features={["Class performance summary", "Per-student drill-down", "Common struggle areas", "And much more..."]}
    />
  );
}
