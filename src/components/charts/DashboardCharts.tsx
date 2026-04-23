import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { DashboardSummary } from '@/domain/reporting';

import { AXIS_PROPS, CHART_COLORS, GRID_PROPS, TOOLTIP_PROPS } from './chartTheme';

export function CrewByRankChart({ data }: { data: DashboardSummary['crewByRank'] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
        <CartesianGrid {...GRID_PROPS} />
        {/* Rank names are long; angling beats truncating them into ambiguity. */}
        <XAxis dataKey="rank" {...AXIS_PROPS} interval={0} angle={-35} textAnchor="end" height={70} />
        <YAxis {...AXIS_PROPS} allowDecimals={false} />
        <Tooltip {...TOOLTIP_PROPS} />
        <Bar dataKey="count" name="Crew" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RotationsTrendChart({ data }: { data: DashboardSummary['rotationsOverTime'] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="month" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} allowDecimals={false} />
        <Tooltip {...TOOLTIP_PROPS} cursor={{ stroke: 'var(--chart-grid)' }} />
        <Legend wrapperStyle={{ fontSize: '0.8125rem' }} />
        <Line
          type="monotone"
          dataKey="signOns"
          name="Sign-ons"
          stroke={CHART_COLORS.primary}
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="signOffs"
          name="Sign-offs"
          stroke={CHART_COLORS.secondary}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function FleetComplianceChart({ data }: { data: DashboardSummary['fleetCompliance'] }) {
  const slices = [
    { name: 'Meets manning', value: data.compliant, fill: CHART_COLORS.primary },
    { name: 'Below manning', value: data.belowManning, fill: CHART_COLORS.danger },
  ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={slices} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%">
          {slices.map((slice) => (
            <Cell key={slice.name} fill={slice.fill} />
          ))}
        </Pie>
        <Tooltip {...TOOLTIP_PROPS} cursor={false} />
        <Legend wrapperStyle={{ fontSize: '0.8125rem' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
