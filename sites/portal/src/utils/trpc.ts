'use client';

import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@enigma/api';

export const trpc = createTRPCReact<AppRouter>();
