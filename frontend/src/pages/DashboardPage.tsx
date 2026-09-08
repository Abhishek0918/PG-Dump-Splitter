import { useNavigate } from "react-router-dom";
import { useAppAuth, useWorkspace } from "../contexts/AppContext";
import { Metric } from "../components/Metric";
import { formatBytes, formatCount, formatDate, prettyJobName } from "../utils";

export default function DashboardPage() {
  const { user } = useAppAuth();
  const { jobs, activeJob, openJob } = useWorkspace();
  const navigate = useNavigate();

  if (!user) return null;

  const completedJobs = jobs.filter((job) => job.status === "completed").length;
  const runningJobs = jobs.filter((job) => job.status === "running" || job.status === "queued").length;
  const totalBytes = jobs.reduce((sum, job) => sum + (job.file_size_bytes || 0), 0);
  const latestJobs = jobs.slice(0, 5);

  const handleOpenJob = (jobId: string) => {
    void openJob(jobId);
    navigate("/splitter");
  };

  return (
    <div className="hub-layout">
      <section className="hub-hero">
        <div>
          <span className="eyebrow">Workspace</span>
          <h2>Welcome, {user.name || user.email}</h2>
          <p>Choose the module you want to work with. The splitter keeps the existing IDE features, while the migration planner focuses on PostgreSQL RDS-to-RDS movement.</p>
        </div>
        <div className="hub-stats">
          <Metric label="Jobs" value={formatCount(jobs.length)} />
          <Metric label="Completed" value={formatCount(completedJobs)} />
          <Metric label="Running" value={formatCount(runningJobs)} />
          <Metric label="Total Size" value={formatBytes(totalBytes)} />
        </div>
      </section>

      <section className="module-grid">
        <button className="module-card profile" onClick={() => navigate("/profile")}>
          <span className="module-icon">ID</span>
          <strong>Profile</strong>
          <p>View your local workspace account, session details, and recent activity.</p>
        </button>
        <button className="module-card splitter primary" onClick={() => navigate("/splitter")}>
          <span className="module-icon">SQL</span>
          <strong>Database Schema Splitter</strong>
          <p>Split PostgreSQL dumps, browse objects, preview SQL, generate restore scripts, and download output.</p>
        </button>
        <button className="module-card migration" onClick={() => navigate("/migration")}>
          <span className="module-icon">RDS</span>
          <strong>Database Migration</strong>
          <p>Design a PostgreSQL RDS-to-RDS migration runbook with commands, validations, and cutover steps.</p>
        </button>
      </section>

      <section className="hub-panel">
        <div className="panel-title">
          <div>
            <h3>Recent splitter jobs</h3>
            <p>{activeJob ? `Active: ${prettyJobName(activeJob)} (${activeJob.status})` : "No active splitter job selected."}</p>
          </div>
          <button className="tool-button" onClick={() => navigate("/splitter")}>Open Splitter</button>
        </div>
        <div className="recent-jobs">
          {latestJobs.length ? latestJobs.map((job) => (
            <button className="recent-job" key={job.job_id} onClick={() => handleOpenJob(job.job_id)}>
              <span>
                <strong>{prettyJobName(job)}</strong>
                <small>{formatBytes(job.file_size_bytes)} | {formatDate(job.created_at)}</small>
              </span>
              <span className={`status-pill ${job.status}`}>{job.status}</span>
            </button>
          )) : <div className="empty-state">No jobs yet. Open the schema splitter to process your first dump.</div>}
        </div>
      </section>
    </div>
  );
}
