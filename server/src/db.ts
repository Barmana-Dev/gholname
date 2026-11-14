import mysql, {
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import { config } from "./config.js";

export const db = mysql.createPool({
  host: config.DB_HOST,
  port: config.DB_PORT,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  database: config.DB_NAME,
  charset: "utf8mb4",
  connectionLimit: config.DB_POOL_SIZE,
  waitForConnections: true,
  queueLimit: config.DB_QUEUE_LIMIT,
  connectTimeout: config.DB_CONNECT_TIMEOUT_MS,
  maxIdle: config.DB_POOL_SIZE,
  idleTimeout: 60_000,
  enableKeepAlive: true,
  decimalNumbers: true,
});

export async function rows<T extends RowDataPacket[]>(
  sql: string,
  params: any[] = [],
): Promise<T> {
  const [result] = await db.execute<T>(sql, params);
  return result;
}

export async function execute(
  sql: string,
  params: any[] = [],
): Promise<ResultSetHeader> {
  const [result] = await db.execute<ResultSetHeader>(sql, params);
  return result;
}

export async function transaction<T>(
  work: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
