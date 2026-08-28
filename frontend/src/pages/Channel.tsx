import { Link, useParams } from "react-router";
import { getStreamerBySlug } from "../lib/whitelist";
import { useEffect, useRef, useState } from "react";
import { StreamEmbed } from "../components/streamEmbed";
import { ChatEmbed } from "../components/chatEmbed";
import { StatusIndicator, StatusIndicatorProps } from "../components/statusIndicator";

const iconsBaseUrl = `${import.meta.env.BASE_URL}icons/`;

interface TranslationLine {
	transcript: string;
	translation: string;
	timestamp: string;
}

export const Channel = () => {
	const { slug } = useParams<{ slug: string }>();
	const streamer = slug ? getStreamerBySlug(slug) : undefined;
	const [streamId, setStreamId] = useState<string | null>(null);
	const [status, setStatus] = useState<StatusIndicatorProps>("connecting");
	const [lines, setLines] = useState<TranslationLine[]>([]);
	const listRef = useRef<HTMLUListElement>(null);
	const stickToBottom = useRef(true);

	useEffect(() => {
		if (stickToBottom.current && listRef.current) {
			listRef.current.scrollTop = listRef.current.scrollHeight;
		}
	}, [lines]);

	useEffect(() => {
		if (!streamer) return;

		const broadcastUrl = import.meta.env.VITE_BROADCAST_URL ?? "";
		const fetchStatus = async () => {
			try {
				const res = await fetch(
					`${broadcastUrl}/status?channel=${streamer.slug}`,
				);
				const data = await res.json();
				setStreamId(data.streamId);
			} catch (err) {
				console.error('Failed to fetch stream status:', err);
			}
		};
		fetchStatus();
		const interval = setInterval(fetchStatus, 30000);
		return () => clearInterval(interval);
	}, [streamer]);

	useEffect(() => {
		if (!streamer) return;
		const broadcastUrl = import.meta.env.VITE_BROADCAST_URL ?? "";
		const eventSource = new EventSource(
			`${broadcastUrl}/sse?channel=${streamer.slug}`,
		);

		const wasConnected = { current: false };
		eventSource.onopen = () => {
			wasConnected.current = true;
			setStatus("connected");
		};

		eventSource.onerror = () =>
			setStatus(wasConnected.current ? "reconnecting" : "error");

		const onTranslation = (e: MessageEvent) => {
			try {
				const data = JSON.parse(e.data as string) as TranslationLine;
				setLines((prev) => [...prev, data].slice(-200));
			} catch (err) {
				console.error('Failed to parse translation event:', err);
			}
		};

		eventSource.addEventListener("translation", onTranslation);

		return () => eventSource.close();
	}, [streamer]);

	if (!streamer) {
		return (
			<div className="flex flex-col items-center py-8 md:py-12 w-full">
				<div className="flex flex-row items-center gap-4">
					<Link
						to="/"
						className="px-4 py-2 bg-neutral-800 rounded-lg font-bold text-sm transition hover:-translate-y-0.5 hover:bg-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-400"
					>
						Back to Directory
					</Link>
					<div className="text-lg font-bold">Channel not found</div>
				</div>
			</div>
		);
	}

	if (!streamId) {
		return (
			<div className="flex flex-col items-center py-8 md:py-12 w-full">
				<div className="flex flex-row items-center gap-4">
					<Link
						to="/"
						className="px-4 py-2 bg-neutral-800 rounded-lg font-bold text-sm transition hover:-translate-y-0.5 hover:bg-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-400"
					>
						Back to Directory
					</Link>
					<div className="text-lg font-bold">Not live right now</div>
				</div>
			</div>
		);
	}

	return (
		<div className="h-dvh flex flex-col gap-4 md:gap-6 w-full max-w-screen-2xl mx-auto px-4 md:px-8 py-3 md:py-6">
			<Link
				to="/"
				className="self-start px-4 py-2 bg-neutral-800 rounded-lg font-bold text-sm transition hover:-translate-y-0.5 hover:bg-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-400"
			>
				Back to Directory
			</Link>

			<div className="flex items-center gap-4">
				<img
					className="w-16 h-16 rounded-full"
					src={`${iconsBaseUrl}${streamer.slug}.jpg`}
					alt={streamer.name}
				/>
				<h1 className="text-2xl font-bold flex items-center gap-3">
					{streamer.name}
					<StatusIndicator status={status} />
				</h1>
			</div>

			<div className="flex flex-col md:flex-row gap-4 md:gap-6 items-stretch md:flex-3 md:min-h-0">
				<div className="shrink-0 md:flex-1 md:min-w-0 md:min-h-0">
					<StreamEmbed streamId={streamId} />
				</div>

				<div className="hidden md:block w-82 shrink-0 min-h-0">
					<ChatEmbed streamId={streamId} />
				</div>
			</div>

			<div className="flex-1 md:flex-2 min-h-0 w-full max-w-5xl mx-auto">
				{lines.length === 0 ? (
					<div className="h-full flex items-center justify-center text-[#ffffffd9]/35">
						No translations yet
					</div>
				) : (
					<ul
						className="h-full flex flex-col gap-2.5 bg-neutral-800 rounded-lg p-4 pl-3 pr-3 overflow-y-auto"
						ref={listRef}
						onScroll={(e) => {
							const el = e.currentTarget;
							stickToBottom.current =
								el.scrollHeight -
									el.scrollTop -
									el.clientHeight <
								48;
						}}
					>
						{lines.map((line, i) => (
							<li key={i} className="flex flex-col gap-0.5">
								<span className="text-xs text-white/40">
									{line.transcript}
								</span>
								<span className="text-sm text-[#ffffffd9]">
									{line.translation}
								</span>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
};
