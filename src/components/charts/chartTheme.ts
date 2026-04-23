// Shared Recharts styling. Colours are CSS custom properties from index.css, so
// a theme switch repaints the charts without a re-render.
export const CHART_COLORS = {
  primary: 'var(--chart-1)',
  secondary: 'var(--chart-2)',
  tertiary: 'var(--chart-3)',
  danger: 'var(--chart-4)',
} as const;

export const AXIS_PROPS = {
  stroke: 'var(--chart-axis)',
  fontSize: 12,
  tickLine: false,
} as const;

export const GRID_PROPS = {
  stroke: 'var(--chart-grid)',
  strokeDasharray: '3 3',
  vertical: false,
} as const;

export const TOOLTIP_PROPS = {
  contentStyle: {
    borderRadius: '0.5rem',
    border: '1px solid var(--line)',
    background: 'var(--surface)',
    color: 'var(--ink)',
    fontSize: '0.8125rem',
  },
  // Recharts paints a grey highlight behind the hovered category by default,
  // which reads as a selection the user did not make.
  cursor: { fill: 'var(--elevated)', fillOpacity: 0.6 },
} as const;
