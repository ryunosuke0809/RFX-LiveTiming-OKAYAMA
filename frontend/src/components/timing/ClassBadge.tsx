"use client";

import { getClassColor } from "@/lib/colors";

interface ClassBadgeProps {
  className: string;
}

export default function ClassBadge({ className }: ClassBadgeProps) {
  const colors = getClassColor(className);
  return (
    <span
      className={`font-bold ${colors.text} leading-none whitespace-nowrap`}
      style={{ fontSize: "0.85em" }}
    >
      {className}
    </span>
  );
}
