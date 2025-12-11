import Link from "next/link";

interface LearnMoreProps {
  to: string;
  children: React.ReactNode;
}

const LearnMore = ({ to, children }: LearnMoreProps) => {
  const isExternal = to.startsWith("http");

  const baseClasses =
    "inline-block relative text-teal-600 transition-colors duration-300 hover:text-teal-600";
  const arrowClasses =
    "inline-block pl-1 transition-all duration-300 group-hover:pl-3";

  if (isExternal) {
    return (
      <a
        href={to}
        target="_blank"
        rel="noopener noreferrer"
        className={`${baseClasses} group`}
      >
        {children}
        <span className={arrowClasses}>→</span>
      </a>
    );
  }

  return (
    <Link href={to} scroll={false} className={`${baseClasses} group`}>
      {children}
      <span className={arrowClasses}>→</span>
    </Link>
  );
};

export default LearnMore;
