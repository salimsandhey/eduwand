# Unified App: dark/light theme restyle + bottom tab navigation

Date: 2026-08-05
Status: Approved

## Goal

Restyle the existing Unified App (all 9 built screens) to match a provided mockup's
visual language — dark-first theme with a light counterpart following the system
setting, bottom tab navigation replacing the current stack-only nav, Ionicons icon
set — without changing functionality, data flow, or backend calls, except for one
small addition (Home screen stats, below).

## Non-goals

- Admin Dashboard is not restyled — stays on its current light theme.
- No new screens, no new backend endpoints beyond reusing what exists.
- No manual theme toggle UI — the theme follows the OS `useColorScheme()` setting only.

## Theming mechanism

A `ThemeContext` (`src/theme/`) with:
- `tokens.ts` — light and dark color token objects (see table below)
- `ThemeContext.tsx` — provider that reads `useColorScheme()` and exposes a
  `useTheme()` hook returning `{ colors, mode }`
- Screens keep their existing `StyleSheet.create` for layout (padding, flex, radius);
  color-related style properties are applied inline from `colors.xxx` so they update
  live when the OS theme changes.

Rejected alternative: pulling in a full UI kit (react-native-paper, tamagui) — more
than this needs, would fight the mockup's specific look.

## Color tokens

| Token | Dark | Light |
|---|---|---|
| background | `#0B0F0D` | `#F5F7F4` |
| surface (cards) | `#141B17` | `#FFFFFF` |
| surface-raised (inputs) | `#1B231E` | `#F0F2EF` |
| border | `#232B26` | `#E1E6DE` |
| accent | `#17C964` | `#1F9D55` |
| accent-dark | `#0FA855` | `#17803F` |
| text primary | `#F5F7F6` | `#131A15` |
| text secondary | `#A8B3AD` | `#4B564D` |
| text muted | `#6B756F` | `#8A948B` |
| danger | `#F31260` | `#C0392B` |
| warning | `#F5A524` | `#B7791F` |

## Navigation restructure

- Add `@react-navigation/bottom-tabs`. Icons: `@expo/vector-icons` Ionicons, outline
  style (already bundled with Expo, no new native dependency).
- Two tab sets, chosen by the logged-in user's role in `AppNavigator.tsx`:
  - `EnrolmentTabs` (front_desk, counsellor, admin, leadership): Home / Enquiries /
    Pipeline / Tasks / More
  - `TeacherTabs` (teacher): Home / Studio / Assignment / Analytics / More — all but
    Home show the existing "not built yet" placeholder, styled like the mockup's
    Lesson Studio screen
- **More tab**: holds CSV Export (enrolment) and Log out — the overflow destination
  for anything without its own tab icon.
- Each tab is its own native-stack navigator, so detail/form screens push on top of
  the relevant tab:
  - Enquiry Detail, New Enquiry Form — push with the tab bar **hidden**
    (`tabBarStyle: { display: 'none' }` on those specific screens)
  - Admission Confirmation, CSV Export — push with the tab bar **visible**
- Student/parent roles: no tab bar, unchanged single "not configured" screen.

## Home screen stats (the one functional addition)

Computed live from existing endpoints, not hardcoded:
- **New Enquiries** — `GET /enquiries?status=new`, `meta.totalCount`
- **Follow Ups** — `GET /follow-up-tasks?status=pending`, count of results
- **Visits Today** — `GET /enquiries?status=visit`, count of results

No backend changes — all three already exist and are school-scoped correctly.

## Screen-by-screen restyle summary

Every existing screen (Login, Home, Enquiry List, New Enquiry Form, Enquiry Detail,
Pipeline Board, Follow Up Task List, Admission Confirmation, CSV Export) gets its
hardcoded colors swapped for theme tokens, matching card rounding/spacing/badge
style from the mockup, plus Ionicons wherever the mockup shows an icon (bell on
Home, back-chevron via the stack navigator's default header, etc.).

## Verification

- `npx tsc --noEmit` clean
- Expo web bundle build succeeds (existing check used throughout this project)
- User verifies visually on their own device/browser — color and spacing fidelity to
  a screenshot isn't something that can be confirmed by automated checks alone.
