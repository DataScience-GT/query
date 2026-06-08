'use client';

import React from 'react';
import Link from 'next/link';

interface FeatureCardProps {
    href?: string;
    title: string;
    description?: string;
    accessLevel?: string;
    icon?: React.ReactNode;
    variant?: 'admin' | 'member' | 'pending' | 'default';
    disabled?: boolean;
    statusBadge?: {
        label: string;
        color: 'green' | 'yellow' | 'red';
    };
}

const variantClasses = {
    admin: {
        border: 'border-[var(--border-subtle)] hover:border-accent/30',
        accessColor: 'text-accent',
        titleHover: 'group-hover:text-accent',
        linkColor: 'text-accent',
        hoverShadow: '',
        gradient: '',
        glow: '',
    },
    member: {
        border: 'border-[var(--border-subtle)] hover:border-green-500/50',
        accessColor: 'text-green-500',
        titleHover: 'group-hover:text-green-400',
        linkColor: 'text-[var(--text-primary)]',
        hoverShadow: 'group-hover:shadow-[0_0_30px_rgba(34,197,94,0.15)]',
        gradient: 'from-green-900/10 via-transparent to-transparent',
        glow: 'bg-green-500/10 group-hover:bg-green-500/20',
    },
    pending: {
        border: 'border-yellow-500/10 hover:border-yellow-500/20',
        accessColor: 'text-yellow-600',
        titleHover: '',
        linkColor: 'text-yellow-500/60',
        hoverShadow: '',
        gradient: '',
        glow: '',
    },
    default: {
        border: 'border-[var(--border-subtle)] hover:border-[var(--border-subtle)]',
        accessColor: 'text-[var(--text-subtle)]',
        titleHover: 'group-hover:text-[var(--text-primary)]',
        linkColor: 'text-[var(--text-muted)]',
        hoverShadow: '',
        gradient: '',
        glow: '',
    },
};


export function FeatureCard({
    href,
    title,
    description,
    accessLevel,
    icon,
    variant = 'default',
    disabled = false,
    statusBadge,
}: FeatureCardProps) {
    const classes = variantClasses[variant];

    const content = (
        <div
            className={`relative p-8 bg-[var(--bg-primary)]/40 border ${classes.border} transition-all duration-300 overflow-hidden ${!disabled ? 'group-hover:translate-y-[-2px]' : ''
                } ${disabled ? 'cursor-default' : ''} ${variant === 'member' ? classes.hoverShadow : ''} rounded-none flex flex-col h-full`}
        >
            {/* Background Effects for Member Variant */}
            {variant === 'member' && (
                <>
                    <div className={`absolute inset-0 bg-gradient-to-br ${classes.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                    <div className={`absolute -right-10 -top-10 w-40 h-40 ${classes.glow} rounded-sm blur-3xl transition-all duration-500`} />
                </>
            )}

            {/* Icon */}
            {icon && (
                <div className={`absolute top-0 right-0 p-4 ${variant === 'member' ? 'p-5 opacity-20 group-hover:opacity-40 transform group-hover:scale-105 group-hover:rotate-3' : 'opacity-10 group-hover:opacity-20'} transition-all duration-300`}>
                    {icon}
                </div>
            )}

            <div className="relative z-10 flex-1">
                {/* Access Level / Status */}
                {accessLevel && (
                    <div className="flex items-center gap-2 mb-3">
                        {variant === 'member' && (
                            <span className="w-2 h-2 rounded-sm bg-green-500 animate-pulse" />
                        )}
                        <p className={`text-xs uppercase tracking-[0.2em] font-bold ${classes.accessColor}`}>
                            {accessLevel}
                        </p>
                    </div>
                )}

                {/* Title */}
                <h3 className={`text-2xl font-bold text-[var(--text-primary)] uppercase tracking-tight mb-2 ${classes.titleHover} transition-colors`}>
                    {title}
                </h3>

                {/* Description */}
                {description && (
                    <p className={`text-sm ${variant === 'member' ? 'text-[var(--text-subtle)] font-mono group-hover:text-[var(--text-muted)] transition-colors' : 'text-[var(--text-subtle)] font-mono'} mb-6 flex-1`}>
                        {variant === 'member' && '> '}{description}
                    </p>
                )}

                {/* Action Link */}
                {!disabled && !statusBadge && (
                    <div className={`mt-auto inline-flex items-center gap-3 text-sm font-mono ${classes.linkColor} ${variant === 'member' ? 'bg-green-500/10 border border-green-500/20 px-6 py-3 rounded-none group-hover:bg-green-500/20 group-hover:border-green-500/40 transition-all' : ''}`}>
                        <span className={`${variant === 'member' ? 'group-hover:text-green-300 transition-colors font-bold tracking-wider' : ''}`}>
                            {variant === 'admin' ? 'INITIATE SESSION' : variant === 'member' ? 'ENTER SYSTEM' : 'VIEW'}
                        </span>
                        <svg className="w-3 h-3 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                    </div>
                )}

                {/* Status Badge */}
                {statusBadge && (
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded bg-${statusBadge.color}-500/10 border border-${statusBadge.color}-500/20 self-start mt-auto`}>
                        <div className={`h-2 w-2 rounded-sm bg-${statusBadge.color}-500 animate-pulse`} />
                        <span className={`text-[10px] font-mono text-${statusBadge.color}-500 font-bold uppercase tracking-wider`}>
                            {statusBadge.label}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );

    if (href && !disabled) {
        return (
            <Link href={href} className="block group h-full">
                {content}
            </Link>
        );
    }

    return <div className="h-full">{content}</div>;
}
