// Every icon in the mockup is a 24-grid stroked path at stroke-width 2. Keeping
// that single shape here means a new icon is one path, not a new SVG wrapper.
const Icon = ({ children, size = 16 }) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

export const ChevronLeftIcon = (props) => <Icon size={14} {...props}><path d="M15 18l-6-6 6-6" /></Icon>;
export const PlusIcon = (props) => <Icon size={15} {...props}><path d="M12 5v14M5 12h14" /></Icon>;
export const CloseIcon = (props) => <Icon size={15} {...props}><path d="M18 6L6 18M6 6l12 12" /></Icon>;
export const SendIcon = (props) => <Icon {...props}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></Icon>;
export const ArrowDownIcon = (props) => <Icon size={15} {...props}><path d="M12 5v14M19 12l-7 7-7-7" /></Icon>;
export const MoonIcon = (props) => <Icon {...props}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></Icon>;
export const SunIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);
export const PencilIcon = (props) => <Icon size={13} {...props}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Icon>;
export const TrashIcon = (props) => <Icon size={13} {...props}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" /></Icon>;
export const CopyIcon = (props) => <Icon size={14} {...props}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></Icon>;
export const CheckIcon = (props) => <Icon size={14} {...props}><path d="M20 6 9 17l-5-5" /></Icon>;
export const RegenerateIcon = (props) => <Icon size={14} {...props}><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></Icon>;
export const ThumbUpIcon = (props) => <Icon size={14} {...props}><path d="M7 10v11" /><path d="M11 21h6.5a2 2 0 0 0 2-1.6l1.2-6A2 2 0 0 0 18.7 11H14V6a2 2 0 0 0-2-2l-1 2-3 5.5V21z" /></Icon>;
export const ThumbDownIcon = (props) => <Icon size={14} {...props}><path d="M17 14V3" /><path d="M13 3H6.5a2 2 0 0 0-2 1.6l-1.2 6A2 2 0 0 0 5.3 13H10v5a2 2 0 0 0 2 2l1-2 3-5.5V3z" /></Icon>;
export const PaperclipIcon = (props) => <Icon size={14} {...props}><path d="M21.4 11.05 12.25 20.2a5.5 5.5 0 0 1-7.78-7.78l9.2-9.2a3.67 3.67 0 0 1 5.18 5.19l-9.19 9.19a1.83 1.83 0 0 1-2.6-2.6l8.5-8.48" /></Icon>;
export const DownloadIcon = (props) => <Icon size={14} {...props}><path d="M12 3v12M7 11l5 5 5-5M4 20h16" /></Icon>;
export const SpinnerIcon = (props) => <Icon size={13} {...props}><path d="M21 12a9 9 0 1 1-6.2-8.6" /></Icon>;
