import * as path from "path";
import * as sharp from "sharp";
import * as FileType from "file-type";
import { NextFunction, Request, Response } from "express";
import { createQueryBuilder, getRepository } from "typeorm";
import { expect } from "chai";

import staticService from "../services/static_service";
import asyncHandler from "../decorators/async_handler";
import { isBinaryIfExist, isNumberIfExist, mustExistOne } from "../decorators/validate_decorators";
import { mustInRangeIfExist } from "../decorators/assert_decorators";
import { Subscription } from "../entities/Subscription";
import { Video } from "../entities/Video";
import {
    DEFAULT_AVATAR_PATH,
    DEFAULT_BANNER_PATH,
    DEFAULT_ICON_PATH,
    User,
} from "../entities/User";
import { randomString } from "../utils/string_function";
import extractFilenameFromPath from "../utils/extract_filename_from_path";

const tempPath = path.join(__dirname, "../../tmp");

class UserController {
    @asyncHandler
    public async getOwnProfile(req: Request, res: Response) {
        const { id } = req.local.auth;

        const user = await getRepository(User).findOne(id);

        const { totalSubscribers } = await createQueryBuilder("subscriptions")
            .select('COUNT(subscriber_id)::INT AS "totalSubscribers"')
            .where("user_id = :userId", { userId: id })
            .getRawOne();

        const { totalViews } = await createQueryBuilder("videos")
            .select('SUM(views)::INT AS "totalViews"')
            .where("uploaded_by = :userId", { userId: id })
            .getRawOne();

        res.status(200).json({
            data: {
                ...user,
                // totalViews and totalSubscribers may be null if there is no videos or subscribers
                totalViews: totalViews || 0,
                totalSubscribers: totalSubscribers || 0,
            },
        });
    }

    @asyncHandler
    public async getUserProfile(req: Request, res: Response) {
        const { username } = req.params;

        const user = await getRepository(User).findOne({ username: username });

        expect(user, "404:user not found").to.exist;

        const { totalSubscribers } = await createQueryBuilder("subscriptions")
            .select('COUNT(subscriber_id)::INT AS "totalSubscribers"')
            .where("user_id = :userId", { userId: user.id })
            .getRawOne();

        const { totalViews } = await createQueryBuilder("videos")
            .select('SUM(views)::INT AS "totalViews"')
            .where("uploaded_by = :userId", { userId: user.id })
            .getRawOne();

        res.status(200).json({
            data: {
                ...user,
                // totalViews and totalSubscribers may be null if there is no videos or subscribers
                totalViews: totalViews || 0,
                totalSubscribers: totalSubscribers || 0,
            },
        });
    }

    @asyncHandler
    @isNumberIfExist("query.offset", "query.limit")
    @mustInRangeIfExist("query.offset", 0, Infinity)
    @mustInRangeIfExist("query.limit", 0, 100)
    public async getOwnVideos(req: Request, res: Response) {
        const { id } = req.local.auth;
        const category = req.query.category as string;
        const offset = +req.query.offset || 0;
        const limit = +req.query.limit || 30;

        let videosQueryBuilder = getRepository(Video)
            .createQueryBuilder("videos")
            .leftJoinAndSelect("videos.categories", "categories")
            .innerJoin("videos.uploadedBy", "users")
            .addSelect(["users.username", "users.iconPath"])
            .where({ uploadedBy: id })
            .orderBy("videos.uploadedAt", "DESC")
            .skip(offset)
            .take(limit);

        // add additional where clause if categories are required
        if (category) {
            videosQueryBuilder = videosQueryBuilder.andWhere("categories.category = :category", {
                category: category,
            });
        }

        const videos = await videosQueryBuilder.getMany();

        res.status(200).json({
            data: videos,
        });
    }

    @asyncHandler
    @isNumberIfExist("query.offset", "query.limit")
    @mustInRangeIfExist("query.offset", 0, Infinity)
    @mustInRangeIfExist("query.limit", 0, 100)
    public async getUserVideos(req: Request, res: Response) {
        const { username } = req.params;
        const category = req.query.category as string;
        const offset = +req.query.offset || 0;
        const limit = +req.query.limit || 30;

        const user = await getRepository(User).findOne({ username }, { select: ["id"] });

        expect(user, "404:user not found").to.exist;

        let videosQueryBuilder = getRepository(Video)
            .createQueryBuilder("videos")
            .leftJoinAndSelect("videos.categories", "categories")
            .innerJoin("videos.uploadedBy", "users")
            .addSelect(["users.username", "users.iconPath"])
            .where({ uploadedBy: user })
            .orderBy("videos.uploadedAt", "DESC")
            .skip(offset)
            .take(limit);

        // add additional where clause if categories are required
        if (category) {
            videosQueryBuilder = videosQueryBuilder.andWhere("categories.category = :category", {
                category: category,
            });
        }

        const videos = await videosQueryBuilder.getMany();

        res.status(200).json({
            data: videos,
        });
    }

    @asyncHandler
    @isNumberIfExist("query.offset", "query.limit")
    @mustInRangeIfExist("query.offset", 0, Infinity)
    @mustInRangeIfExist("query.limit", 0, 100)
    public async getSubscriptions(req: Request, res: Response) {
        const { id } = req.local.auth;
        const offset = +req.query.offset || 0;
        const limit = +req.query.limit || 30;

        const _subscriptions = await getRepository(Subscription)
            .createQueryBuilder("subscriptions")
            .leftJoin("subscriptions.user", "users")
            .addSelect(["users.username", "users.firstName", "users.lastName", "users.iconPath"])
            .where("subscriptions.subscriber = :userId", { userId: id })
            .skip(offset)
            .take(limit)
            .getMany();

        const subscriptions = _subscriptions.map((subscription) => subscription.user);

        res.status(200).json({
            data: subscriptions,
        });
    }

    @asyncHandler
    @isNumberIfExist("query.offset", "query.limit")
    @mustInRangeIfExist("query.offset", 0, Infinity)
    @mustInRangeIfExist("query.limit", 0, 100)
    public async getSubscribers(req: Request, res: Response) {
        const { id } = req.local.auth;
        const offset = +req.query.offset || 0;
        const limit = +req.query.limit || 30;

        const _subscriptions = await getRepository(Subscription)
            .createQueryBuilder("subscriptions")
            .leftJoin("subscriptions.subscriber", "subscribers")
            .addSelect([
                "subscribers.username",
                "subscribers.firstName",
                "subscribers.lastName",
                "subscribers.iconPath",
            ])
            .where("subscriptions.user = :userId", { userId: id })
            .skip(offset)
            .take(limit)
            .getMany();

        const subscribers = _subscriptions.map((subscription) => subscription.subscriber);

        res.status(200).json({
            data: subscribers,
        });
    }

    @asyncHandler
    @mustExistOne(
        "body.first_name",
        "body.last_name",
        "body.female",
        "files.avatar",
        "files.banner",
    )
    @isBinaryIfExist("body.female")
    public async updateProfile(req: Request, res: Response, next: NextFunction) {
        const { first_name, last_name, female } = req.body;
        const { avatar, banner } = req.files;

        const userRepository = getRepository(User);

        const user = await userRepository.findOne(req.local.auth.id);

        user.firstName = first_name || user.firstName;
        user.lastName = last_name || user.lastName;

        if (female !== undefined) {
            user.female = female === "1";
        }

        if (avatar) {
            const avatarType = await FileType.fromFile(avatar.path);
            expect(avatarType.ext, "400:invalid file").to.be.oneOf(["jpg", "png"]);

            // stop handle when user contain invalid property
            user.validate();

            const iconName = randomString(32) + ".jpg";
            const iconPath = path.join(tempPath, iconName);

            await sharp(avatar.path).resize(64, 64).jpeg().toFile(iconPath);

            await staticService.postPhoto(avatar);

            await staticService.postPhoto({
                mimetype: "image/jpeg",
                type: "jpg",
                path: iconPath,
                name: iconName,
            });

            if (user.avatarPath !== DEFAULT_AVATAR_PATH) {
                await staticService.deletePhoto(extractFilenameFromPath(user.avatarPath));
            }
            if (user.iconPath !== DEFAULT_ICON_PATH) {
                await staticService.deletePhoto(extractFilenameFromPath(user.iconPath));
            }

            user.avatarPath = "/photos/" + avatar.name;
            user.iconPath = "/photos/" + iconName;

            req.local.tempFilePaths.push(iconPath);
        }

        if (banner) {
            expect(banner.mimetype, "400:invalid file").to.match(/image/);

            user.validate();

            await staticService.postPhoto(banner);

            if (user.bannerPath !== DEFAULT_BANNER_PATH) {
                await staticService.deletePhoto(extractFilenameFromPath(user.bannerPath));
            }

            user.bannerPath = "/photos/" + banner.name;
        }

        await userRepository.save(user);

        res.status(200).json({
            data: user,
        });

        next();
    }
}

export default new UserController();
