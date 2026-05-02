interface CardProps {
    children: any;
    className?: string;
}

const Card = ({ children, className = "" }: CardProps) => {
    return (
        <div className={className}>
            {children}
        </div>
    );
};

export default Card;
