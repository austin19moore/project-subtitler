export const StreamEmbed = ({ streamId }: { streamId: string }) => {
    return (
        <div className="relative w-full aspect-video md:aspect-auto md:w-auto md:max-w-full md:h-[min(100%,calc(100vw*9/16))] bg-black rounded-lg overflow-hidden">
            <iframe
                className="w-full h-full absolute inset-0"
                src={`https://www.youtube.com/embed/${streamId}?autoplay=0`}
                title="YouTube stream"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
            />
        </div>
    );
};
