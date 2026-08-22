"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function SecuritySessionHeading({
  children,
  focus,
}: {
  children: ReactNode;
  focus: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focus) headingRef.current?.focus();
  }, [focus]);

  return (
    <h2
      ref={headingRef}
      id="active-sessions-heading"
      tabIndex={-1}
      className="text-lg font-semibold text-foreground outline-none"
    >
      {children}
    </h2>
  );
}