// Hacklytics editions render in the Digital Bloom look, which needs the
// pixel and text faces of /hacklytics. Only the CSS is shared here; a face is
// downloaded only when a page actually uses it, so other hackathons pay nothing.
import "../../hacklytics/fonts.generated.css";

export default function HackathonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
