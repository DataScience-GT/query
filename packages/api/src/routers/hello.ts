import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";

export const helloRouter = createTRPCRouter({
  // Public endpoint - anyone can call
  sayHello: publicProcedure.mutation(() => {
    return {
      message: "You should sign in 😁",
      timestamp: new Date().toISOString(),
    };
  }),

  // Public endpoint with input
  greetPublic: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(({ input }) => {
      return {
        message: `Hello ${input.name}! Welcome to our app! 🎉`,
      };
    }),

  // Protected endpoint - only authenticated users
  sayHelloAuth: protectedProcedure.mutation(({ ctx }) => {
    // ctx.session.user is guaranteed to exist here due to middleware
    const user = ctx.session.user;

    return {
      message: `Hello ${user.name || user.email}! 🎉`,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }),

  // Protected with input
  greet: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return {
        message: `Hello ${input.name}, from ${ctx.session.user.email}!`,
        userId: ctx.userId,
      };
    }),
});