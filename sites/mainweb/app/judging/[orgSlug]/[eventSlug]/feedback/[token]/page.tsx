import { panelRequest } from "@/lib/panel.server";

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const response = await panelRequest(
    `/v1/feedback/${encodeURIComponent(token)}`,
  );
  if (response.status === 403) {
    return (
      <main style={{ padding: "2rem" }}>
        Feedback is available after results are published, and only with this
        project's link.
      </main>
    );
  }
  if (!response.ok) {
    return (
      <main style={{ padding: "2rem" }}>
        This feedback link is not available.
      </main>
    );
  }
  const card = (await response.json()) as {
    name: string;
    criteria: { label: string; mean: number; median: number }[];
    places: { track: string; placement: number | null }[];
    comments: string[];
  };
  return (
    <main style={{ maxWidth: 36 * 16, margin: "3rem auto", padding: "0 1rem" }}>
      <h1>{card.name}</h1>
      <ul>
        {card.places.map((item) => (
          <li key={item.track}>
            {item.track}:{" "}
            {item.placement === null ? "not placed" : item.placement}
          </li>
        ))}
      </ul>
      <ul>
        {card.criteria.map((item) => (
          <li key={item.label}>
            {item.label}: {item.mean.toFixed(1)} versus a median of{" "}
            {item.median.toFixed(1)}
          </li>
        ))}
      </ul>
      {card.comments.map((comment, index) => (
        <p key={`${index}-${comment}`}>{comment}</p>
      ))}
    </main>
  );
}
