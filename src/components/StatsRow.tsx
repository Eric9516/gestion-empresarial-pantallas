import type { ReactNode } from 'react';
interface Stat {
  icon: ReactNode;
  iconColor: 'blue' | 'green' | 'red';
  value: number;
  label: string;
}

// Fila de 2-4 tarjetas de estadística — mismo bloque que se repetía copiado en
// Proveedores, Comisionistas, etc.
export default function StatsRow({ stats }: { stats: Stat[] }) {
  return (
    <div className="stats-row">
      {stats.map((s, i) => (
        <div className="stat-card" key={i}>
          <div className={`stat-icon ${s.iconColor}`}>{s.icon}</div>
          <div><div className="stat-number">{s.value}</div><div className="stat-label">{s.label}</div></div>
        </div>
      ))}
    </div>
  );
}
