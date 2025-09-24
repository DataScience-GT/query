import React from 'react';
import Prizes from '../ui/Prizes';
import Speakers from '../ui/Speaker';

const ConferencePage: React.FC = () => {
  // Data can be managed here or fetched from an API
  const prizes = [
    {
      position: '',
      amount: '',
      image: '../tickets/gold.png' // Path to your 1st place PNG
    },
    {
      position: '2nd',
      amount: '',
      image: '../tickets/silver.png' // Path to your 2nd place PNG
    },
    {
      position: '',
      amount: '',
      image: '../tickets/bronze.png' // Path to your 3rd place PNG
    }
  ];

  const speakers = [
    {
      id: 1,
      name: 'Full Speaker Name',
      title: 'Senior Developer',
      company: 'Tech Corp',
      bio: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      image: '/api/placeholder/150/150'
    },
    {
      id: 2,
      name: 'Full Speaker Name',
      title: 'Product Manager',
      company: 'Innovation Ltd',
      bio: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      image: '/api/placeholder/150/150'
    },
    {
      id: 3,
      name: 'Full Speaker Name',
      title: 'UX Designer',
      company: 'Design Studio',
      bio: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      image: '/api/placeholder/150/150'
    },
    {
      id: 4,
      name: 'Full Speaker Name',
      title: 'Data Scientist',
      company: 'AI Solutions',
      bio: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      image: '/api/placeholder/150/150'
    }
  ];

  return (
    // I used ai for this cuz i forgot about sections and im too lazy to write it all over again 
    <section id="prizes" className="section-anchor scroll-mt-28 bg-sky py-16 px-4">
      {/* This div centers the content and sets a max-width */}
      <div className="max-w-6xl mx-auto">
        {/* Render the Prizes component and pass the data */}
        <div className="mb-24"> {/* Added margin-bottom for spacing */}
          <Prizes prizes={prizes} />
        </div>

        {/* Render the Speakers component and pass the data */}
        <Speakers speakers={speakers} />
      </div>
    </section>
  );
};

export default ConferencePage;