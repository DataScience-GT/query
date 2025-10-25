"use client";

import { QRCodeSVG } from "qrcode.react";

interface QRCodeComponentProps {
  value: string;
}

export default function QRCodeComponent({ value }: QRCodeComponentProps) {
  return (
    <div className="inline-block p-4 bg-white rounded-lg shadow-md">
      <QRCodeSVG
        value={value}
        size={200}
        bgColor="#ffffff"
        fgColor="#000000"
        level="H"
        includeMargin={true}
      />
    </div>
  );
}
