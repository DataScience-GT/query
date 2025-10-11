import React from 'react';
import Prizes from '../ui/Prizes';
import Speakers from '../ui/Speaker';

const ConferencePage: React.FC = () => {
  const prizes = [
    {
      position: '',
      amount: '',
      image: '../tickets/gold.png'
    },
    {
      position: '2nd',
      amount: '',
      image: '../tickets/silver.png'
    },
    {
      position: '',
      amount: '',
      image: '../tickets/bronze.png'
    }
  ];

  const speakers = [
    {
      id: 1,
      name: 'Pending',
      title: 'Pending',
      company: 'Pending',
      bio: 'Pending',
      image: '../wonka/wonka.png'
    },
    {
      id: 2,
      name: 'Pending',
      title: 'Pending',
      company: 'Pending',
      bio: 'Pending',
      image: '../wonka/wonka.png'
    },
    {
      id: 3,
      name: 'Pending',
      title: 'Pending',
      company: 'Pending',
      bio: 'Pending',
      image: '../wonka/wonka.png'
    },
    {
      id: 4,
      name: 'Pending',
      title: 'Pending',
      company: 'Pending',
      bio: 'Pending',
      image: '../wonka/wonka.png'
    }
  ];

  return (
    <section id="prizes" className="section-anchor scroll-mt-28 bg-sky py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-24">
          <Prizes prizes={prizes} />
        </div>
        <Speakers speakers={speakers} />
      </div>
    </section>
  );
};

export default ConferencePage;
