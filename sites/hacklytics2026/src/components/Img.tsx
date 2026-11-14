import type { CSSProperties } from "react";

interface ImgProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  /** Fill the positioned parent, like next/image's `fill`. */
  fill?: boolean;
  /** Load eagerly instead of lazily. */
  priority?: boolean;
}

const FILL: CSSProperties = {
  position: "absolute",
  height: "100%",
  width: "100%",
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  color: "transparent",
};

/** Plain <img> that renders the same markup next/image gave the static export. */
export default function Img({ src, alt, className, width, height, fill, priority }: ImgProps) {
  return (
    <img
      alt={alt}
      loading={priority ? undefined : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      decoding="async"
      data-nimg={fill ? "fill" : "1"}
      className={className}
      style={fill ? FILL : { color: "transparent" }}
      src={src}
    />
  );
}
