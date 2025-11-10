"use client";

import React from 'react';
import Image from 'next/image';

const CandyIcon: React.FC = () => (
  <div className="inline-block mx-2 w-[75px] h-[50px] drop-shadow-md relative">
    <Image
      src="/mid-candy/medium.png"
      alt="Candy"
      width={75}
      height={50}
      className="object-contain"
    />
  </div>
);

export default CandyIcon;
