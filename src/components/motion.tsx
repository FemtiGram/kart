"use client";

// Motion wrappers for subtle page animations (motion.dev, ~3KB).
// To remove all animations: delete this file, uninstall `motion`,
// and replace <FadeIn>, <FadeInView>, <HoverLift> with plain <div> in page.tsx.

import { motion } from "motion/react";
import type { ReactNode } from "react";

// Fade-up entrance on mount
export function FadeIn({
  children,
  delay = 0,
  className,
}: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Fade-up when scrolling into view
export function FadeInView({
  children,
  delay = 0,
  className,
}: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Card with subtle hover lift
export function HoverLift({
  children,
  className,
}: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
