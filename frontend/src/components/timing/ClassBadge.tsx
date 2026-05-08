"use client";

import { getClassColor } from "@/lib/colors";

interface ClassBadgeProps {
  className: string;
}

export default function ClassBadge({ className }: ClassBadgeProps) {
  const colors = getClassColor(className);
  return (
    <span
      className={`inline-block px-1.5 py-px rounded-sm font-bold ${colors.bg} ${colors.text} leading-none`}
      style={{ fontSize: "0.75em" }}
    >
      {className}
    </span>
  );
}
