import { Text, TextStyle, StyleProp } from "react-native";
import { getDateLongParts } from "../utils/date";

interface OrdinalDateProps {
  dateIso: string;
  style?: StyleProp<TextStyle>;
}

// Renders "04" + superscript "th" + " Sep 2026"
export function OrdinalDate({ dateIso, style }: OrdinalDateProps) {
  const { day, suffix, monthYear } = getDateLongParts(dateIso);
  return (
    <Text style={style}>
      {day}
      <Text style={{ fontSize: 9, top: -5 }}>{suffix}</Text>
      {` ${monthYear}`}
    </Text>
  );
}
