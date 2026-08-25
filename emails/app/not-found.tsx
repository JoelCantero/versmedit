import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found-shell">
      <p className="eyebrow">404 / closed catalogue</p>
      <h1>Proof not found</h1>
      <Link className="return-link" href="/">
        <span aria-hidden="true">←</span>
        Catalogue
      </Link>
    </main>
  );
}