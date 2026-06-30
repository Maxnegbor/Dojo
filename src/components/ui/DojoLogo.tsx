interface DojoLogoProps {
  className?: string
  size?: number
}

/** Minimal Japanese dojo / shrine mark — readable from favicon to header sizes. */
export function DojoLogo({ className, size = 24 }: DojoLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      {/* Pine trees */}
      <path d="M1 25.5 3.8 17.5 4.8 19.8 5.8 16.5 7.2 25.5Z" />
      <path d="M31 25.5 28.2 17.5 27.2 19.8 26.2 16.5 24.8 25.5Z" />

      {/* Curved roof with upturned eaves */}
      <path d="M1 16.2C0.4 14.2 1.8 12.8 4 12L15 7.8C15.8 7.5 16.2 7.5 17 7.8L28 12C30.2 12.8 31.6 14.2 31 16.2L28.8 16.8 16.5 12.2 3.2 16.8Z" />

      {/* Roof ridge */}
      <path d="M6.5 12.2 16 8.8 25.5 12.2 16 10.6Z" opacity="0.45" />

      {/* Roof tile lines */}
      <path
        d="M8 13.2H24M9.5 14.4H22.5"
        stroke="currentColor"
        strokeWidth="0.45"
        strokeLinecap="round"
        opacity="0.28"
      />

      {/* Main hall + verandas */}
      <path d="M7 16H25V25H7Z" />
      <path d="M4 19.5H7V25H4Z" />
      <path d="M25 19.5H28V25H25Z" />

      {/* Sacred rope + paper streamers */}
      <path d="M11.5 17.2H20.5V17.9H11.5Z" />
      <path d="M12.8 18.1V20.1L13.5 19.1Z" />
      <path d="M14.8 18.1V20.8L15.5 19.1Z" />
      <path d="M16.8 18.1V20.1L17.5 19.1Z" />
      <path d="M18.8 18.1V20.8L19.5 19.1Z" />

      {/* Stairs */}
      <path
        d="M11.5 21H20.5M11.5 22H20.5M11.5 23H20.5M11.5 24H20.5"
        stroke="currentColor"
        strokeWidth="0.55"
        strokeLinecap="round"
        opacity="0.32"
      />

      {/* Stone platform */}
      <path d="M2.5 25.2H29.5M4 26.4H28M5.5 27.4H26.5" opacity="0.32" />
    </svg>
  )
}
