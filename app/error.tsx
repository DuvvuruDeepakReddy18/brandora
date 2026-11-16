"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main>
      <section className="panel settings-panel">
        <h1>We couldn’t open this view.</h1>
        <p>
          Your saved workspace records remain on the server. Try opening the
          view again.
        </p>
        <button className="button primary" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
