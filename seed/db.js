const pg = require("pg");
const path = require("path");
const { Pool } = require("pg");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const pool = new Pool({
    user: process.env.DB_USERNAME,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

pool.connect();

module.exports.pool = pool;

module.exports.query = function (query, values) {
    return new Promise((resolve, reject) => {
        pool.query(query, values, (err, result) => {
            if (err) return reject(err);
            resolve(result);
        });
    });
};
