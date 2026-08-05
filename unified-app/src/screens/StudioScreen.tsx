import { ComingSoonScreen } from "../components/ComingSoonScreen";

export function StudioScreen() {
  return (
    <ComingSoonScreen
      icon="book-outline"
      title="Lesson Studio"
      description="AI-powered lesson generation is coming soon."
      features={["Smart lesson plans", "Curriculum aligned", "Save to classroom", "And much more..."]}
    />
  );
}
