import { Column, Entity, Index, JoinColumn, OneToOne } from "typeorm";
import { User } from "./User";

export const STREAM_KEY_LENGTH = 32;

@Index("streams_pkey", ["id"], { unique: true })
@Entity("streams", { schema: "public" })
export class Stream {
    @Column("character", { primary: true, name: "id", length: 10 })
    id: string;

    @Column("character", { name: "stream_key", length: STREAM_KEY_LENGTH, select: false })
    streamKey: string;

    @Column("character varying", { name: "name", length: 128 })
    name: string;

    @Column("character varying", { name: "thumbnail_path", length: 128 })
    thumbnailPath: string | null;

    @Column("boolean", { name: "is_streaming", default: false })
    isStreaming: boolean;

    @Column("integer", { name: "user_id", select: false })
    userId: number;

    @OneToOne(() => User, (users) => users.stream)
    @JoinColumn([{ name: "user_id", referencedColumnName: "id" }])
    user: User;
}
