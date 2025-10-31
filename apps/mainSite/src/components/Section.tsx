import React from "react";

interface SectionProps {
  id?: string;
  children?: React.ReactNode;
  makefull?: boolean;
}

const Section: React.FC<SectionProps> = ({ id, children, makefull }) => {
  return (
    <section id={id} className={`${makefull ? "w-full" : "max-w-7xl mx-auto"} py-12`}>{children}</section>
  );
};

export default Section;
