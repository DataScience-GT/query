import { createTRPCRouter } from "../trpc";
import { sayHello, greetPublic, sayHelloAuth, greet } from "./hello-procedures";

export const helloRouter = createTRPCRouter({
  sayHello,
  greetPublic,
  sayHelloAuth,
  greet,
});
