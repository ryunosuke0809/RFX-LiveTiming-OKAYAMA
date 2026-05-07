"use client";

import { getClassColor } from "@/lib/colors";

interface ClassBadgeProps {
  className: string;
}

export default function ClassBadge({ className }: ClassBadgeProps) {
  const colors = getClassColor(className);
  return (
    <span
      className={`inline-block px-1 py-0 rounded-sm text-[8px] font-bold ${colors.bg} ${colors.text} leading-tight`}
    >
      {className}
    </span>
  );
}
