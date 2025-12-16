import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@query/api';

export const trpc = createTRPCReact<AppRouter>();