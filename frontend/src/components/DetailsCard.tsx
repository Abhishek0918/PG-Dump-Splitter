export function DetailsCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return <section className="details-card"><h3>{title}</h3><dl className="details-list">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>;
}
