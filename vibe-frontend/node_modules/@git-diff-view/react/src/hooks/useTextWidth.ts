import { getTextMeasureInstance } from "@git-diff-view/utils";
import { useState } from "react";

import { useSafeLayout } from "./useSafeLayout";

export const useTextWidth = ({
  text,
  font,
}: {
  text: string;
  font: { fontFamily?: string; fontStyle?: string; fontSize?: string };
}) => {
  const [width, setWidth] = useState(() => {
    const fontSize = parseInt(font.fontSize);
    let baseSize = 6;
    baseSize += fontSize > 10 ? (fontSize - 10) * 0.6 : 0;
    return baseSize * text.length;
  });

  useSafeLayout(() => {
    const width = getTextMeasureInstance().measure(text, font);

    setWidth(width);
  }, [text, font]);

  return width;
};
