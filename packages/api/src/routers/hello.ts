import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";

export const helloRouter = createTRPCRouter({
  // Public endpoint
  sayHello: publicProcedure.mutation(() => {
    return {
      message: "You should sign in",
      timestamp: new Date().toISOString(),
    };
  }),

  // Public endpoint with input validation
  greetPublic: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(({ input }) => {
      return {
        message: `Hello ${input.name}! Welcome to the app.`,
      };
    }),

  // Requires authentication
  sayHelloAuth: protectedProcedure.mutation(({ ctx }) => {
    const user = ctx.session.user;

    return {
      message: `Hello ${user.name ?? user.email}!`,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }),

  // Authenticated endpoint with input
  greet: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return {
        message: `Hello ${input.name}, from ${ctx.session.user.email}`,
        userId: ctx.userId,
      };
    }),
});
