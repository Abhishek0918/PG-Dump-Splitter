import { useNavigate } from "react-router-dom";
import { useAppAuth, useWorkspace } from "../contexts/AppContext";
import { DetailsCard } from "../components/DetailsCard";
import { initialsFor } from "../helpers";
import { formatCount, formatDate, prettyJobName } from "../utils";

export default function ProfilePage() {
  const { user } = useAppAuth();
  const { jobs, activeJob } = useWorkspace();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <div className="profile-layout">
      <section className="profile-card">
        <div className="profile-avatar">{initialsFor(user.name || user.email)}</div>
        <div>
          <span className="eyebrow">Profile</span>
          <h2>{user.name || "Local User"}</h2>
          <p>{user.email}</p>
        </div>
      </section>
      <section className="profile-grid">
        <DetailsCard
          title="Account"
          rows={[
            ["Auth Type", "Server email/password"],
            ["Created", formatDate(user.created_at)],
            ["Last Login", formatDate(user.last_login_at)],
            ["Storage", "SQLite users + server session"]
          ]}
        />
        <DetailsCard
          title="Workspace"
          rows={[
            ["Jobs", formatCount(jobs.length)],
            ["Active Job", activeJob ? prettyJobName(activeJob) : "-"],
            ["Active Status", activeJob?.status || "-"],
            ["Objects Parsed", formatCount(activeJob?.object_count)]
          ]}
        />
      </section>
      <section className="hub-panel">
        <div className="panel-title">
          <div>
            <h3>Security note</h3>
            <p>This login uses server-side sessions stored in SQLite for this local workspace. Production hardening can add SSO, rate limits, and HTTPS deployment controls later.</p>
          </div>
          <button className="run-button" onClick={() => navigate("/splitter")}>Go to Schema Splitter</button>
        </div>
      </section>
    </div>
  );
}
