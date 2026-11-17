import { ArrowRight, ArrowUpRight } from "lucide-react";

type Destination =
  "Rulebook & sources" | "Visual checks" | "Content studio" | "Review desk";
const crew = [
  {
    id: "cite",
    name: "CITE",
    task: "Claims & sources",
    destination: "Rulebook & sources",
  },
  {
    id: "lens",
    name: "LENS",
    task: "Visual checks",
    destination: "Visual checks",
  },
  {
    id: "lingo",
    name: "LINGO",
    task: "Content & languages",
    destination: "Content studio",
  },
  {
    id: "relay",
    name: "RELAY",
    task: "Review & approval",
    destination: "Review desk",
  },
] as const;

export function WorkspaceCrew({
  onNavigate,
}: {
  onNavigate: (view: Destination) => void;
}) {
  return (
    <section className="crew-workbench" aria-label="Your Brand Crew workspace">
      <div className="crew-workbench-story">
        <div className="crew-workbench-copy">
          <span className="eyebrow">
            FOUR SPECIALISTS. ONE SHARED STANDARD.
          </span>
          <h2>
            Your brand.
            <br />
            <em>In good hands.</em>
          </h2>
          <p>
            From the first claim to the final sign-off.
            <br />
            The evidence stays with the work.
          </p>
          <button
            className="hero-link"
            onClick={() => onNavigate("Review desk")}
          >
            Open review desk <ArrowRight size={16} />
          </button>
        </div>
        <div className="crew-ensemble" aria-hidden="true">
          <span className="crew-studio-label">
            FOUR SPECIALISTS / ONE WORKSPACE
          </span>
          <div className="crew-portraits">
            {crew.map((member) => (
              <div key={member.id} className={`crew-portrait ${member.id}`}>
                <img
                  src={`/crew/${member.id}.png`}
                  width="180"
                  height="180"
                  alt=""
                />
                <span>{member.name}</span>
              </div>
            ))}
          </div>
          <span className="crew-human-note">
            AI checks. <em>Humans decide.</em>
          </span>
        </div>
      </div>
      <nav className="crew-shortcuts" aria-label="Crew shortcuts">
        {crew.map((member, i) => (
          <button
            key={member.id}
            className={member.id}
            onClick={() => onNavigate(member.destination)}
          >
            <span className="crew-shortcut-number">0{i + 1}</span>
            <span>
              <b>{member.name}</b>
              <small>{member.task}</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
        ))}
      </nav>
    </section>
  );
}
