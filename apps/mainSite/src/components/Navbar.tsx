import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

interface NavbarProps {
  screen_width?: number;
  page?: string;
  className?: string;
}

const Navbar: React.FC<NavbarProps> = ({ page, className = "" }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const menuItems = [
    { name: "Home", to: "/" },
    { name: "About", to: "/about" },
    { name: "Bootcamp", to: "/#bootcamp" },
  ];

  return (
    <div className={`w-full ${className}`}>
      <div className="max-w-[1200px] mx-auto flex justify-between items-center px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className={`text-2xl font-bold ${page === "home" ? "text-teal-500" : ""}`}>DSGT</button>
        </div>

        <div className="hidden md:flex items-center gap-6">
          {menuItems.map(item => (
            <button key={item.name} onClick={() => navigate(item.to)} className="font-semibold">
              {item.name}
            </button>
          ))}
        </div>

        <div className="md:hidden">
          <button onClick={() => setMenuOpen(!menuOpen)} className="px-3 py-2 border rounded">Menu</button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden bg-white/90 p-4">
          {menuItems.map(item => (
            <div key={item.name} className="py-2">
              <button onClick={() => { setMenuOpen(false); navigate(item.to); }} className="w-full text-left">
                {item.name}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Navbar;
