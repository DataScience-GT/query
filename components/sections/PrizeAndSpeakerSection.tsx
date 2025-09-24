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
    // Replaced the gradient classes with the specified background color
    <div className="min-h-screen bg-[#A4C7FF] py-16 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Render the Prizes component and pass the data */}
        <Prizes prizes={prizes} />
        
        {/* Render the Speakers component and pass the data */}
        <Speakers speakers={speakers} />
      </div>
    </div>
  );
};

export default ConferencePage;