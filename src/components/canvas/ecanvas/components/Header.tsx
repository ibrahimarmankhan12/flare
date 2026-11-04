import "./Header.css";

interface Props {
  providerName: string;
  modelLabel: string;
  onOpenSettings: () => void;
}

export function Header({ providerName, modelLabel, onOpenSettings }: Props) {
  return (
    <header className="app-header">
      <div className="header-title">
        <span className="header-title-main">F L A R E - S H</span>
        <span className="header-sep">/</span>
        <span className="header-title-sub">E CANVAS</span>
      </div>
      <div className="header-right">
        <button
          className="btn btn-ghost what-is-this-btn"
          onClick={onOpenSettings}
        >
          Select Model
        </button>
        <div className="header-divider" />

        <button className="header-model-btn" onClick={onOpenSettings}>
          <span className="header-status-dot on" />
          <span className="header-model-provider">{providerName}</span>
          <span className="header-model-sep">/</span>
          <span className="header-model-name">{modelLabel}</span>
          <svg
            className="header-gear"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
    </header>
  );
}
