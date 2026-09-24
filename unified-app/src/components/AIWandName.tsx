import { Fragment, ReactNode } from "react";
import { StyleProp, Text, TextStyle } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { AI_ASSISTANT_NAME, AI_ASSISTANT_NAME_ACCENT, AI_ASSISTANT_NAME_REST } from "../constants/brand";

interface Props {
  style?: StyleProp<TextStyle>;
  // Overrides for a surface the theme doesn't describe (e.g. a fixed-color
  // overlay). Defaults: brand primary for "AI", textPrimary for "Wand" -
  // dark on light surfaces, light on dark ones.
  accentColor?: string;
  textColor?: string;
}

/**
 * The assistant's two-tone wordmark: "AI" in the brand primary color, "Wand"
 * in the surface's text color. It's a <Text>, so it works standalone (pass a
 * font style) or nested inside another <Text>, where it inherits font size
 * and weight. Screen readers hear the plain name.
 *
 * Only use it on a light/neutral surface, or pass colors that contrast -
 * primary-on-primary (e.g. inside a user's accent chat bubble) disappears.
 */
export function AIWandName({ style, accentColor, textColor }: Props) {
  const { colors } = useTheme();
  return (
    <Text style={style} accessibilityLabel={AI_ASSISTANT_NAME}>
      <Text style={{ color: accentColor ?? colors.accent }}>{AI_ASSISTANT_NAME_ACCENT}</Text>
      <Text style={{ color: textColor ?? colors.textPrimary }}>{AI_ASSISTANT_NAME_REST}</Text>
    </Text>
  );
}

/**
 * Plain text with every occurrence of the assistant's name swapped for the
 * wordmark - for text the assistant itself says (greeting, model replies).
 * Render the result inside a <Text>.
 */
export function withAIWandName(text: string, colors?: { accentColor?: string; textColor?: string }): ReactNode {
  const parts = text.split(AI_ASSISTANT_NAME);
  if (parts.length === 1) return text;
  return parts.map((part, index) => (
    <Fragment key={index}>
      {part}
      {index < parts.length - 1 ? <AIWandName {...colors} /> : null}
    </Fragment>
  ));
}
