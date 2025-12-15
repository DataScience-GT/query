// components/EventCard/index.tsx
"use client";

import Image, { StaticImageData } from "next/image";
import Link from "next/link";

interface EventCardProps {
  img: string | StaticImageData;
  heading: string;
  when?: string;
  button_text: string;
  button_to: string;
  children: React.ReactNode;
}

const EventCard = ({ img, heading, when, button_text, button_to, children }: EventCardProps) => {
  return (
    <div className="flex flex-col justify-between bg-gray-900 text-white rounded-xl overflow-hidden shadow-lg transition-transform hover:-translate-y-1 w-full h-full">
      <div className="relative w-full h-48">
        <Image src={img} alt={heading} fill className="object-cover" />
      </div>
      <div className="p-4 flex flex-col gap-2">
        <h3 className="text-xl font-bold">{heading}</h3>
        {when && <span className="text-sm text-gray-400">{when}</span>}
        <p className="text-sm text-gray-200">{children}</p>
        <Link href={button_to} className="mt-4 inline-block text-teal-500 font-bold hover:text-teal-400">
          {button_text}
        </Link>
      </div>
    </div>
  );
};

export default EventCard;
