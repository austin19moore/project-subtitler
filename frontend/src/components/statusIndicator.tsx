export type StatusIndicatorProps = "connecting" | "connected" | "reconnecting" | "error";

const statusConfig: Record<StatusIndicatorProps, { color: string; pulse: boolean }> = {
    connecting: { color: "bg-yellow-400", pulse: true },
    connected: { color: "bg-green-400", pulse: false },
    reconnecting: { color: "bg-yellow-400", pulse: true },
    error: { color: "bg-red-400", pulse: false },
};

export const StatusIndicator = ({ status }: { status: StatusIndicatorProps }) => {
    const { color, pulse } = statusConfig[status];
    return (
        <span
            className={`inline-block mt-1.5 w-3 h-3 rounded-full ${color} ${pulse ? "animate-pulse" : ""}`}
            title={status}
        />
    );
};
