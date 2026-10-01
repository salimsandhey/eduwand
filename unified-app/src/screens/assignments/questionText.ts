import { AssignmentQuestion } from "../../api/client";
import { stripBoldMarkers } from "../studio/generation/richText";

// Assignment question text (prompt/options/pairs/items/model answers) lands
// in plain <TextInput> fields, which can't render a bold span the way
// FlashcardsView etc. can - so unlike those views, a stray "**" from the
// model has nowhere to go but stripped outright, not rendered as real bold.
export function sanitizeQuestion(q: AssignmentQuestion): AssignmentQuestion {
  return {
    ...q,
    prompt: stripBoldMarkers(q.prompt),
    options: q.options?.map(stripBoldMarkers),
    pairs: q.pairs?.map((p) => ({ left: stripBoldMarkers(p.left), right: stripBoldMarkers(p.right) })),
    items: q.items?.map(stripBoldMarkers),
  };
}
