import { Route, Routes, useParams } from "react-router"
import { Channel } from "./pages/Channel"
import { Directory } from "./pages/Directory"

const ChannelRoute = () => {
    const { slug } = useParams<{ slug: string }>()
    return <Channel key={slug} />
}

export const App = () => {
    return (
        <Routes>
            <Route path="/" element={<Directory />} />
            <Route path="/:slug" element={<ChannelRoute />} />
        </Routes>
    )
}
