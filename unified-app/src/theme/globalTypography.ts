import { Text, TextInput } from "react-native";
import { typography } from "./tokens";

type ComponentWithDefaults = {
  defaultProps?: {
    style?: unknown;
  };
};

let applied = false;

function applyFontFamily(component: ComponentWithDefaults) {
  component.defaultProps = component.defaultProps ?? {};
  const existingStyle = component.defaultProps.style;
  component.defaultProps.style = existingStyle
    ? [existingStyle, { fontFamily: typography.fontFamily }]
    : { fontFamily: typography.fontFamily };
}

export function applyGlobalTypography() {
  if (applied) return;
  applyFontFamily(Text as ComponentWithDefaults);
  applyFontFamily(TextInput as ComponentWithDefaults);
  applied = true;
}
