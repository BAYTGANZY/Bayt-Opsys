import type { SVGProps } from "react";

/**
 * Inline "fp" wordmark for the BAYT sidebar.
 * Pure SVG so it scales crisply at any DPR.
 */
export function FpLogo({
  title = "fp",
  ...props
}: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 32"
      role="img"
      aria-label={title}
      fill="none"
      {...props}
    >
      <title>{title}</title>
      {/* f */}
      <path
        d="M18 6h-4.5c-2.8 0-4.5 1.7-4.5 4.5V14H6v4h3v10h5V18h4.5v-4H14v-2.6c0-.9.5-1.4 1.4-1.4H18V6z"
        fill="currentColor"
      />
      {/* p */}
      <path
        d="M30 14c-2 0-3.6.8-4.7 2.1V14H21v18h4.7v-6.1c1.1 1.3 2.7 2.1 4.7 2.1 3.9 0 7-3.4 7-7.5S33.9 14 30 14zm-1 11.3c-2.1 0-3.7-1.7-3.7-3.8s1.6-3.8 3.7-3.8 3.7 1.7 3.7 3.8-1.6 3.8-3.7 3.8z"
        fill="currentColor"
      />
    </svg>
  );
}

export default FpLogo;
