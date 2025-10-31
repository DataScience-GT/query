import React from "react";

interface FooterProps { screen_width?: number }

const Footer: React.FC<FooterProps> = () => {
  return (
    <footer className="w-full bg-gray-900 text-white py-8 mt-12">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">DSGT</h3>
          <div className="text-sm">Made with ♥ by the DSGT Tech Team</div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
