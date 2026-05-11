"use client";

import React from "react";

type BackgroundProps = React.HTMLAttributes<HTMLDivElement>;

export default function Background(props: BackgroundProps) {
  return (
    <div
      {...props}
      className="absolute top-0 left-0 w-full h-full -z-10 bg-gray-800"
      style={{
        backgroundRepeat: "repeat",
        backgroundSize: "150px",
        filter: "brightness(0.5)"
      }}
    >
      {/* Optional navigation background */}
      <div className="absolute w-full h-full"></div>
    </div>
  );
}
