const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const ShuffleIcon = () => (
  <svg {...base}>
    <path d="M3 7h3.5c1.6 0 2.6 1 3.6 2.5L13 14c1 1.5 2 2.5 3.6 2.5H21" />
    <path d="M3 17h3.5c1.6 0 2.6-1 3.6-2.5" />
    <path d="M14 12.5c.9-1.2 1.8-2 3.6-2H21" />
    <path d="M18.5 4.5 21 7l-2.5 2.5M18.5 14 21 16.5 18.5 19" />
  </svg>
)

export const ContrastIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" />
  </svg>
)

export const BackIcon = () => (
  <svg {...base}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
)

export const UndoIcon = () => (
  <svg {...base}>
    <path d="M4 9h9.5a5 5 0 0 1 0 10H8" />
    <path d="M8 4.5 3.5 9 8 13.5" />
  </svg>
)

export const ResetIcon = () => (
  <svg {...base}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20.5 4v4.5H16" />
  </svg>
)

/** Three states joined by two moves — the shape every puzzle here really has. */
export const BrandMark = () => (
  <svg {...base} strokeWidth={2}>
    <path d="M7.2 8.4 10.8 12M13.2 12l3.6-3.6M7.2 15.6h9.6" />
    <circle cx="5" cy="7" r="2.4" />
    <circle cx="12" cy="13" r="2.4" />
    <circle cx="19" cy="7" r="2.4" />
  </svg>
)

/** Two sliders. A gear says machinery; this says "things you can set". */
export const SettingsIcon = () => (
  <svg {...base}>
    <path d="M4 8.5h6M14.5 8.5H20M4 15.5h3.5M12 15.5H20" />
    <circle cx="12.25" cy="8.5" r="2.25" />
    <circle cx="9.75" cy="15.5" r="2.25" />
  </svg>
)

export const TickIcon = () => (
  <svg {...base}>
    <path d="M4.5 12.5 9.5 18 20 6" />
  </svg>
)
