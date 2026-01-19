import { z } from "zod";
import { publicProcedure, protectedProcedure } from "../trpc";

export const sayHello = publicProcedure.mutation(() => {
    return {
        message: "You should sign in",
        timestamp: new Date().toISOString(),
    };
});

export const greetPublic = publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(({ input }) => {
        return {
            message: `Hello ${input.name}! Welcome to the app.`,
        };
    });

export const sayHelloAuth = protectedProcedure.mutation(({ ctx }) => {
    const user = ctx.session.user;

    return {
        message: `Hello ${user.name ?? user.email}!`,
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
        },
    };
});

export const greet = protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
        return {
            message: `Hello ${input.name}, from ${ctx.session.user.email}`,
            userId: ctx.userId,
        };
    });
