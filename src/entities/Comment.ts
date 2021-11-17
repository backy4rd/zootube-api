import {MaxLength, validateOrReject} from "class-validator";
import {
    BeforeInsert,
    BeforeUpdate,
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from "typeorm";
import VirtualColumn from "../decorators/VirtualColumn";
import { CommentLike } from "./CommentLike";
import { User } from "./User";
import { Video } from "./Video";

@Index("comments_pkey", ["id"], { unique: true })
@Entity("comments", { schema: "public" })
export class Comment {
    @PrimaryGeneratedColumn({ type: "integer", name: "id" })
    id: number;

    @MaxLength(2000, { message: "content is too long" })
    @Column("character varying", { name: "content", length: 2000 })
    content: string;

    @Column("timestamp with time zone", { name: "created_at", default: () => "CURRENT_TIMESTAMP" })
    createdAt: Date;

    @OneToMany(() => CommentLike, (commentLikes) => commentLikes.comment)
    commentLikes: CommentLike[];

    @ManyToOne(() => Comment, (comments) => comments.comments, {
        onDelete: "CASCADE",
    })
    @JoinColumn([{ name: "parent_id", referencedColumnName: "id" }])
    parent: Comment;

    @OneToMany(() => Comment, (comments) => comments.parent)
    comments: Comment[];

    @ManyToOne(() => User, (users) => users.comments, { onDelete: "CASCADE" })
    @JoinColumn([{ name: "user_id", referencedColumnName: "id" }])
    user: User;

    @ManyToOne(() => Video, (videos) => videos.comments, { onDelete: "CASCADE" })
    @JoinColumn([{ name: "video_id", referencedColumnName: "id" }])
    video: Video;

    // --- virtual columns
    @VirtualColumn("integer")
    like: number | null;

    @VirtualColumn("integer")
    dislike: number | null;

    @VirtualColumn("integer")
    totalReplies: number | null;

    @VirtualColumn("boolean")
    react: boolean | null;

    @BeforeInsert()
    @BeforeUpdate()
    async validate(): Promise<void> {
        await validateOrReject(this, { skipMissingProperties: true });
    }
}
