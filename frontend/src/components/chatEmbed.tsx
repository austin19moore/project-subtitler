export const ChatEmbed = ({ streamId }: { streamId: string }) => {
    return (
        <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
            <iframe
                className="w-full h-full absolute inset-0"
                src={`https://www.youtube.com/live_chat?v=${streamId}&embed_domain=${window.location.hostname}&dark_theme=1`}
                title="YouTube chat"
            />
        </div>
    );
};
