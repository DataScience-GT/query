import React from 'react';
import Prizes from '../ui/Prizes';
import Speakers from '../ui/Speaker';

const ConferencePage: React.FC = () => {
  const prizes = [
    {
      position: '',
      amount: '',
      image: '../tickets/gold.png',
      label: '(per person)' 
    },
    {
      position: '2nd',
      amount: '',
      image: '../tickets/silver.png',
      label: '(per person)'
    },
    {
      position: '',
      amount: '',
      image: '../tickets/bronze.png',
      label: '(per person)'
    }
  ];

  const speakers = [
    {
      id: 1,
      name: 'TBD',
      title: '',
      company: '',
      bio: '',
      image: '../wonka/wonka.png'
    },
    {
      id: 2,
      name: 'TBD',
      title: '',
      company: '',
      bio: '',
      image: '../wonka/wonka.png'
    },
    {
      id: 3,
      name: 'TBD',
      title: '',
      company: '',
      bio: '',
      image: '../wonka/wonka.png'
    },
    {
      id: 4,
      name: 'TBD',
      title: '',
      company: '',
      bio: '',
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