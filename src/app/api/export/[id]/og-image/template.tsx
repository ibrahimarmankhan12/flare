type OgCardData = {
  title: string;
  author: string;
  userText: string;
  assistantText: string;
};

function BaseCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background:
          "radial-gradient(circle at 16% 10%, rgb(42, 58, 90) 0%, rgb(15, 20, 32) 42%, rgb(8, 11, 18) 100%)",
        color: "white",
        padding: "34px",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
      }}
    >
      {children}
    </div>
  );
}

export function ExportOgImage({ data }: { data: OgCardData }) {
  return (
    <BaseCard>
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          borderRadius: "28px",
          border: "1px solid rgba(255, 255, 255, 0.16)",
          background:
            "linear-gradient(180deg, rgba(32, 36, 48, 0.95), rgba(14, 18, 27, 0.95))",
          padding: "36px",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                fontSize: 56,
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              {data.title}
            </div>
            <div
              style={{
                fontSize: 38,
                color: "rgba(255, 255, 255, 0.72)",
                marginLeft: "20px",
              }}
            >
              x
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              borderRadius: "24px",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              background: "rgba(21, 25, 36, 0.8)",
              padding: "24px",
            }}
          >
            <div
              style={{
                alignSelf: "flex-end",
                maxWidth: "80%",
                display: "flex",
                background: "rgba(255, 255, 255, 0.94)",
                color: "rgb(18, 21, 28)",
                padding: "16px 18px",
                borderRadius: "18px",
                fontSize: 28,
                lineHeight: 1.3,
              }}
            >
              {data.userText}
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 600,
                  color: "rgba(255, 255, 255, 0.96)",
                }}
              >
                Result
              </div>
              <div
                style={{
                  fontSize: 29,
                  lineHeight: 1.38,
                  color: "rgba(231, 237, 246, 0.9)",
                }}
              >
                {data.assistantText}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "18px",
          }}
        >
          <div
            style={{
              fontSize: 24,
              color: "rgba(202, 216, 238, 0.78)",
            }}
          >
            Shared by {data.author}
          </div>
          <div
            style={{
              fontSize: 50,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "rgba(248, 251, 255, 0.95)",
            }}
          >
            Flare AI
          </div>
        </div>
      </div>
    </BaseCard>
  );
}

export function ExportOgFallback({
  title,
  subtitle,
}: { title: string; subtitle: string }) {
  return (
    <BaseCard>
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.2 }}>
            {title}
          </div>
          <div style={{ fontSize: 30, color: "rgb(163, 177, 197)" }}>
            {subtitle}
          </div>
        </div>
        <div style={{ fontSize: 50, color: "rgb(228, 234, 242)" }}>
          Flare AI
        </div>
      </div>
    </BaseCard>
  );
}
