const fs = require("fs");
const request = require("request-promise");
const { takeRandomEleInArray, randomRange, promisePool, parseTokens } = require("./util");
const { query } = require("./db");

const [, , apiBaseUrl] = process.argv;
const { USER_DEFAULT_PASSWORD, GOOGLE_API_KEY } = process.env;
if (!apiBaseUrl) throw new Error("missing argument");

const vietnameseCharacters =
    "ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂưăạảấầẩẫậắằẳẵặẹẻẽềềểỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪễệỉịọỏốồổỗộớờởỡợụủứừỬỮỰỲỴÝỶỸửữựỳỵỷỹ";

const nameRegex = new RegExp(`^(?! )[ a-zA-Z${vietnameseCharacters}]+(?<! )$`);

module.exports.createUser = async function (numUser) {
    let users = JSON.parse(fs.readFileSync("./users.json", "utf8")).slice(0, numUser);

    const tokens = [];

    while (users.length > 0) {
        const regiss = users.splice(0, 50).map((u) =>
            request
                .post(apiBaseUrl + "/auth/register", {
                    form: {
                        username: u.login.username,
                        password: USER_DEFAULT_PASSWORD,
                        first_name: u.name.first,
                        last_name: u.name.last,
                        female: u.gender === "female" ? "1" : "0",
                    },
                    json: true,
                })
                .then((res) => tokens.push(res.data.token))
                .catch((e) => console.log(e.message)),
        );
        const responses = await Promise.all(regiss);
    }

    return tokens;
};

async function createVideo({ publisher, users, videoPath, id, categories }) {
    const gRes = await request.get(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${id}&key=${GOOGLE_API_KEY}`,
        { json: true },
    );

    const videoData = gRes.items[0];

    const { data: video } = await request.post(apiBaseUrl + "/videos/", {
        formData: {
            video: fs.createReadStream(videoPath),
            title: videoData.snippet.title,
            description: videoData.snippet.description,
            categories: categories,
        },
        headers: {
            Authorization: "Barear " + publisher,
        },
        json: true,
    });

    await query("UPDATE videos SET views = $1, uploaded_at = $2 WHERE id = $3", [
        ~~(videoData.statistics.viewCount / 100),
        new Date(videoData.snippet.publishedAt),
        video.id,
    ]);

    const likeCount = +videoData.statistics.likeCount;
    const dislikeCount = +videoData.statistics.dislikeCount;

    const reactors = takeRandomEleInArray(users, (likeCount + dislikeCount) % users.length);
    const ix = (likeCount / (likeCount + dislikeCount)) * reactors.length;
    const likeReactors = reactors.slice(0, ix);
    const dislikeReactors = reactors.slice(ix);

    if (likeReactors.length > 0) {
        await reactVideo({
            videoId: video.id,
            react: true,
            reactors: likeReactors,
        });
    }

    if (dislikeReactors.length > 0) {
        await reactVideo({
            videoId: video.id,
            react: false,
            reactors: dislikeReactors,
        });
    }

    return { video, videoData };
}

async function createReplies({ commentId, videoId, publishers, repliesData, n }) {
    const takenRepliesData = repliesData.slice(0, n);
    const creates = takenRepliesData.map(async (item) => {
        if (item.snippet.textOriginal === "") return;
        const [_publisher] = takeRandomEleInArray(publishers, 1);
        const [publisher] = parseTokens([_publisher]);

        await query(
            "INSERT INTO comments(content, created_at, video_id, user_id, parent_id) VALUES ($1, $2, $3, $4, $5)",
            [
                item.snippet.textOriginal.substring(0, 2000),
                new Date(item.snippet.publishedAt),
                videoId,
                publisher.id,
                commentId,
            ],
        );
    });

    return Promise.all(creates);
}

async function createComments({ id, videoId, publishers, n }) {
    let pageToken = "";

    let count = 1;

    do {
        let items;
        try {
            const gRes = await request.get(
                `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet,replies&maxResults=30&videoId=${id}&pageToken=${pageToken}&key=${GOOGLE_API_KEY}`,
                { json: true },
            );
            pageToken = gRes.nextPageToken;
            items = gRes.items;
        } catch (err) {
            return;
        }

        const takenItems = items.slice(0, n - comments.length);
        for (const item of takenItems) {
            if (item.snippet.topLevelComment.snippet.textOriginal === "") continue;
            const [_publisher] = takeRandomEleInArray(publishers, 1);
            const [publisher] = parseTokens([_publisher]);

            const { rows } = await query(
                "INSERT INTO comments(content, created_at, video_id, user_id) VALUES ($1, $2, $3, $4) RETURNING id",
                [
                    item.snippet.topLevelComment.snippet.textOriginal.substring(0, 2000),
                    new Date(item.snippet.topLevelComment.snippet.publishedAt),
                    videoId,
                    publisher.id,
                ],
            );

            const [{ id: commentId }] = rows;

            const likeCount = item.snippet.topLevelComment.snippet.likeCount;
            const dislikeCount = randomRange(0, likeCount * 0.1);

            const reactors = takeRandomEleInArray(
                publishers,
                (likeCount + dislikeCount) % publishers.length,
            );
            const ix = (likeCount / (likeCount + dislikeCount)) * reactors.length;
            const likeReactors = reactors.slice(0, ix);
            const dislikeReactors = reactors.slice(ix);

            if (likeReactors.length > 0) {
                await reactComment({
                    videoId,
                    commentId: comment.id,
                    react: true,
                    reactors: likeReactors,
                });
            }
            if (dislikeReactors.length > 0) {
                await reactComment({
                    videoId,
                    commentId: comment.id,
                    react: false,
                    reactors: dislikeReactors,
                });
            }

            if (item.replies) {
                const replies = await createReplies({
                    commentId: comment.id,
                    videoId,
                    publishers,
                    repliesData: item.replies.comments,
                    n: item.replies.comments.length < 30 ? item.replies.comments.length : 30,
                });
            }
            count++;
        }
    } while (count < n && pageToken);
}

async function reactComment({ videoId, commentId, reactors, react }) {
    const q = `INSERT INTO comment_likes(comment_id, user_id, "like") VALUES ($1, $2, $3)`;
    const _reactors = parseTokens(reactors);
    await promisePool(_reactors, 50, (reactor) => query(q, [commentId, reactor.id, react]));
}

async function reactVideo({ videoId, reactors, react }) {
    const q = `INSERT INTO video_likes(video_id, user_id, "like") VALUES ($1, $2, $3)`;
    const _reactors = parseTokens(reactors);
    await promisePool(_reactors, 50, (reactor) => query(q, [videoId, reactor.id, react]));
}

module.exports.createVideo = async function ({ publisher, users, videoPath, categories }) {
    const [id] = videoPath.replace(/^.*[\\\/]/, "").split(".");

    const { video, videoData } = await createVideo({
        id,
        publisher,
        users,
        videoPath,
        categories: categories.join(","),
    });

    const comments = await createComments({
        id,
        videoId: video.id,
        publishers: users,
        n: videoData.statistics.commentCount % users.length,
    });
};
