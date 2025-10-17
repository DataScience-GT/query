import React from 'react';

interface Prize {
  image: string;
}

interface PrizesProps {
  prizes: Prize[];
}

const Prizes: React.FC<PrizesProps> = ({ prizes }) => {
  return (
    <div className="text-center mb-16">
      <h2 className="text-5xl font-bold text-white mb-12 drop-shadow-lg">
        Prizes
      </h2>
      <div className="flex flex-wrap justify-center gap-8">
        {prizes.map((prize, index) => (
          <div
            key={index}
            className="w-80 h-40 bg-cover bg-center hover:scale-105 transition-transform duration-300 cursor-pointer"
            style={{ backgroundImage: `url('${prize.image}')` }}
          />
        ))}
      </div>
    </div>
  );
};

export default Prizes;
