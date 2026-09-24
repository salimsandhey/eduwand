import { PresentationReason, PresentationSlideRole, ROLE_SEQUENCES } from "./ai";

// Spec step 6: "when 1 [class], up to 8-12 slides, when 2 classes, 7-10
// slides per class, when 3 classes, 5-8 slides per class."
export function slidesPerClassRange(classes: number): { min: number; max: number } {
  if (classes <= 1) return { min: 8, max: 12 };
  if (classes === 2) return { min: 7, max: 10 };
  return { min: 5, max: 8 }; // classes === 3 (the hard max per spec)
}

// Fixed (never expanded) roles get exactly 1 slide each. Everything else in
// a reason's sequence is "variable" and shares the remaining slide budget.
const VARIABLE_ROLE_BOUNDS: Partial<Record<PresentationSlideRole, { min: number; max: number }>> = {
  explain_core: { min: 2, max: 4 },
  check: { min: 1, max: 2 },
  step: { min: 3, max: 8 }, // "step xn" - real cap comes from the remaining slide budget
  must_know: { min: 2, max: 4 },
  rapid_fire: { min: 5, max: 10 },
};

function expandCounts(reason: PresentationReason, totalSlides: number): Record<PresentationSlideRole, number> {
  const roles = ROLE_SEQUENCES[reason];
  const counts: Partial<Record<PresentationSlideRole, number>> = {};
  let fixedTotal = 0;
  for (const role of roles) {
    if (!VARIABLE_ROLE_BOUNDS[role]) {
      counts[role] = 1;
      fixedTotal += 1;
    }
  }
  const variableRoles = roles.filter((r) => VARIABLE_ROLE_BOUNDS[r]);
  let remaining = Math.max(totalSlides - fixedTotal, variableRoles.reduce((sum, r) => sum + VARIABLE_ROLE_BOUNDS[r]!.min, 0));
  for (const role of variableRoles) {
    const bounds = VARIABLE_ROLE_BOUNDS[role]!;
    counts[role] = bounds.min;
    remaining -= bounds.min;
  }
  // Distribute whatever's left, round-robin, capped at each role's max -
  // revision_deck's rapid_fire absorbs most of it since it has the widest band.
  let guard = 0;
  while (remaining > 0 && guard < 1000) {
    guard += 1;
    let placed = false;
    for (const role of variableRoles) {
      const bounds = VARIABLE_ROLE_BOUNDS[role]!;
      if (remaining <= 0) break;
      if ((counts[role] ?? 0) < bounds.max) {
        counts[role] = (counts[role] ?? 0) + 1;
        remaining -= 1;
        placed = true;
      }
    }
    if (!placed) break; // every variable role is at its max - stop
  }
  return counts as Record<PresentationSlideRole, number>;
}

export interface RoleSequenceEntry {
  role: PresentationSlideRole;
  classIndex: number; // 0-indexed
}

// Builds the final, ordered role sequence: expand variable-count roles to hit
// totalSlides (spec step 6/7), split evenly across `classes` (spec: "One
// topic cannot have 10 slides across 3 classes"), then splice in
// section_divider before each class boundary and recap_bridge as the first
// slide of every class after the first (spec: "Multi-class decks").
export function buildRoleSequence(params: { reason: PresentationReason; totalSlides: number; classes: number }): RoleSequenceEntry[] {
  const { reason, totalSlides, classes } = params;
  const counts = expandCounts(reason, totalSlides);
  const flat: PresentationSlideRole[] = [];
  for (const role of ROLE_SEQUENCES[reason]) {
    const n = counts[role] ?? 1;
    for (let i = 0; i < n; i += 1) flat.push(role);
  }

  if (classes <= 1) return flat.map((role) => ({ role, classIndex: 0 }));

  // Even-ish split by slide count, keeping "title" always first (class 0).
  const perClass = Math.ceil(flat.length / classes);
  const result: RoleSequenceEntry[] = [];
  let classIndex = 0;
  let countInClass = 0;
  for (let i = 0; i < flat.length; i += 1) {
    if (countInClass >= perClass && classIndex < classes - 1) {
      result.push({ role: "section_divider", classIndex });
      classIndex += 1;
      result.push({ role: "recap_bridge", classIndex });
      countInClass = 0;
    }
    result.push({ role: flat[i], classIndex });
    countInClass += 1;
  }
  return result;
}
