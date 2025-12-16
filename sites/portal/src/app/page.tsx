'use client';

import { trpc } from '../lib/trpc';

export default function Home() {
  const { data, isLoading } = trpc.hello.sayHello.useQuery();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Portal</h1>
      <p>{data?.message}</p>
    </div>
  );
}