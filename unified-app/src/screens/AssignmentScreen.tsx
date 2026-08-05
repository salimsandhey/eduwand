import { ComingSoonScreen } from "../components/ComingSoonScreen";

export function AssignmentScreen() {
  return (
    <ComingSoonScreen
      icon="document-text-outline"
      title="Assignment Lab"
      description="AI-personalised assignments and grading are coming soon."
      features={["Personalised difficulty", "AI grading + feedback", "Teacher approval on every change", "And much more..."]}
    />
  );
}
