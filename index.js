const { addonBuilder } = require("stremio-addon-sdk");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const express = require("express");

const ALLDEBRID_API_KEY = "v8JpzbMJvLfkdmGsAriS"; // <-- هنا تحط API Key حق AllDebrid

const builder = new addonBuilder({
    id: "org.stremio.arab-torrents",
    version: "1.0.0",
    name: "Arab Torrents (via AllDebrid)",
    description: "Stream torrents from arab-torrents.com using AllDebrid",
    resources: ["stream"],
    types: ["movie"],
    idPrefixes: ["tt"],
    catalogs: [] // <-- إضافة هذا السطر
});

builder.defineStreamHandler(async ({ type, id }) => {
    if (type !== "movie") return { streams: [] };

    const imdbId = id;
    const searchUrl = `https://www.arab-torrents.com/search.php?search=${imdbId}`;

    try {
        const res = await fetch(searchUrl);
        const html = await res.text();
        const $ = cheerio.load(html);

        const torrents = [];

        $("a[href*='download']").each((_, el) => {
            const href = $(el).attr("href");
            if (href && href.includes("download")) {
                const fullLink = "https://www.arab-torrents.com/" + href;
                torrents.push(fullLink);
            }
        });

        const streams = [];

        for (const url of torrents) {
            try {
                const torrentRes = await fetch(url);
                const torrentBuffer = await torrentRes.buffer();

                const uploadRes = await fetch("https://api.alldebrid.com/v4/magnet/upload", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${ALLDEBRID_API_KEY}`
                    },
                    body: torrentBuffer
                });

                const uploadData = await uploadRes.json();
                const magnet = uploadData?.data?.magnets?.[0]?.magnet;

                if (!magnet) continue;

                const instantRes = await fetch(`https://api.alldebrid.com/v4/magnet/instant?magnets[]=${encodeURIComponent(magnet)}`, {
                    headers: {
                        Authorization: `Bearer ${ALLDEBRID_API_KEY}`
                    }
                });

                const instantData = await instantRes.json();
                if (instantData?.data?.instant?.[0]?.instant) {
                    streams.push({
                        title: "AllDebrid - ArabTorrents",
                        url: magnet,
                        behaviorHints: {
                            notWebReady: false
                        }
                    });
                }
            } catch (err) {
                console.warn("فشل تحميل تورنت:", url);
            }
        }

        return { streams };
    } catch (err) {
        console.error("فشل جلب الصفحة:", err);
        return { streams: [] };
    }
});

const app = express();
const PORT = 7000;

const manifest = {
    id: "org.stremio.arab-torrents",
    version: "1.0.0",
    name: "Arab Torrents (via AllDebrid)",
    description: "Stream torrents from arab-torrents.com using AllDebrid",
    resources: ["stream"],
    types: ["movie"],
    idPrefixes: ["tt"],
    catalogs: [] // Ensure this is an array
};

app.get("/manifest.json", (_, res) => {
    res.json(manifest);  // إرجاع الـ manifest كـ JSON
});

app.get("/stream/:type/:id.json", async (req, res) => {
    const { type, id } = req.params;
    const result = await builder.get("stream", { type, id });
    res.send(result);
});

app.listen(PORT, () => {
    console.log(`✅ الإضافة شغّالة على: http://localhost:${PORT}/manifest.json`);
});
