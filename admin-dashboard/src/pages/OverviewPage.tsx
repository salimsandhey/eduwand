import { useAuth } from "../context/AuthContext";
import { PlatformOverview } from "./overview/PlatformOverview";
import { LeadershipOverview } from "./overview/LeadershipOverview";
import { SchoolOverview } from "./overview/SchoolOverview";

export function OverviewPage() {
  const { user } = useAuth();

  if (user?.role === "platform_admin") return <PlatformOverview />;
  if (user?.role === "leadership") return <LeadershipOverview />;
  return <SchoolOverview />;
}
