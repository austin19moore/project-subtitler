import { Link } from "react-router";
import { streamers } from "../lib/whitelist";
const iconsBaseUrl = `${import.meta.env.BASE_URL}icons/`;

export const Directory = () => {
    return (
        <div className="flex flex-col items-center py-8 md:py-12">
            <div className="flex flex-wrap justify-center gap-12 max-w-4xl w-full">
                {streamers.map((streamer) => (
                    <Link
                        className="flex bg-neutral-800 rounded-lg transition px-6 py-4 gap-4 hover:-translate-y-0.5 hover:bg-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-400 w-72"
                        to={`/${streamer.slug}`}
                        key={streamer.slug}
                    >
                        <img
                            className="w-16 h-16 rounded-full shrink-0"
                            src={`${iconsBaseUrl}${streamer.slug}.jpg`}
                            alt={streamer.name}
                        />
                        <div
                            className="flex-1 min-w-0 flex justify-center items-center text-lg font-bold"
                        >
                            <span className="truncate">{streamer.name}</span>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
};
