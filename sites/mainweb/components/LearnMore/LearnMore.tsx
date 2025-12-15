import Link from "next/link";

interface LearnMoreProps {
  to: string;
  children: React.ReactNode;
  target?: string;
  rel?: string;
}

const LearnMore = ({ to, children, target, rel }: LearnMoreProps) => {
  const isExternal = to.startsWith("http");

  const baseClasses =
    "inline-block relative text-teal-600 transition-colors duration-300 hover:text-teal-600";
  const arrowClasses =
    "inline-block pl-1 transition-all duration-300 group-hover:pl-3";

  if (isExternal) {
    const outTarget = target ?? "_blank";
    const outRel = rel ?? "noopener noreferrer";

    return (
      <a href={to} target={outTarget} rel={outRel} className={`${baseClasses} group`}>
        {children}
        <span className={arrowClasses}>→</span>
      </a>
    );
  }

  return (
    <Link href={to} scroll={false} className={`${baseClasses} group`} target={target} rel={rel}>
      {children}
      <span className={arrowClasses}>→</span>
    </Link>
  );
};

export default LearnMore;
