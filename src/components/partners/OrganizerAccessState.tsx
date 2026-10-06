import Link from "next/link";
import styles from "./OrganizerDashboard.module.css";

export default function OrganizerAccessState({ kind, loginHref = "/login" }: {
  kind: "denied" | "missing" | "unavailable" | "unconfigured" | "unauthenticated"; loginHref?: string;
}) {
  const title = kind === "denied" ? "Organizer access denied" : kind === "missing" ? "Partner event not found"
    : kind === "unauthenticated" ? "Sign in to the organizer workspace" : kind === "unconfigured"
      ? "Organizer workspace is not available for this event" : "Organizer workspace is temporarily unavailable";
  const description = kind === "denied" ? "Your account does not currently have organizer access to this event."
    : kind === "unavailable" ? "Please try again in a moment." : kind === "unconfigured"
      ? "Event information is being finalized. Please check back later." : kind === "unauthenticated"
        ? "Your session has ended. Sign in again to verify your access." : "Explore the partner events on HackerMate.";
  return <main className={styles.page}><div className={styles.container}>
    <h1 className={styles.title}>{title}</h1><p className={styles.muted}>{description}</p>
    {kind === "unauthenticated" && <Link className={styles.primary} href={loginHref}>Sign in</Link>}
    {kind === "unavailable" && <a className={styles.secondary} href="">Try again</a>}
    <Link className={styles.textLink} href="/partners">Explore partners</Link>
  </div></main>;
}
