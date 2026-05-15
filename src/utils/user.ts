import Database from "bun:sqlite";
import { RequestResponse, toRequestResponse } from "./types";
import { nanoid } from "nanoid";
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getAccessSecret, getRefreshSecret } from "./auth";

export class User{

  private database: Database;

  initUserTable(){
    this.database.prepare(`
      CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY,
        username TEXT,
        password TEXT
      )
    `).run()
  }
  constructor(db: Database){
    this.database = db;
    this.initUserTable()
  }

  // 登录
  login(body: any, cookie: any): RequestResponse{
    if (!body || !body.username || !body.password) {
      return toRequestResponse(false, "参数不正确");
    }
    const { username, password } = body;

    const user = this.database.prepare("SELECT password FROM user WHERE username = ?").get(username) as any;
    if (!user) {
      return toRequestResponse(false, "用户名或密码不正确");
    }
    const match = bcrypt.compareSync(password, user.password);
    if (!match) {
      return toRequestResponse(false, "用户名或密码不正确");
    }

    const accessToken=jwt.sign(
      {
        username,
      }, 
      getAccessSecret(),
      {
        expiresIn: "10m",
      }
    );

    const refreshToken = jwt.sign(
      {
        username,
      }, 
      getRefreshSecret(),
      {
        expiresIn: "30d",
      }
    );

    cookie.multicash_refresh_token.set({
      value: refreshToken,
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: true,
      path: "/api/auth/refresh",
    })

    return toRequestResponse(true, accessToken);
  }

  // 注册
  register(body: any): RequestResponse{
    if (!body || !body.username || !body.password) {
      return toRequestResponse(false, "参数不正确");
    }
    const rowCount = this.database
      .prepare("SELECT COUNT(*) AS count FROM user")
      .get() as { count: number };
    if(rowCount.count != 0){
      return toRequestResponse(false, "用户已存在")
    }
    const { username, password } = body;
    try {
      const existingUser = this.database.prepare("SELECT * FROM user WHERE username = ?").get(username);
      if (existingUser) {
        return toRequestResponse(false, "用户名已存在");
      }
      const id=nanoid();
      this.database.prepare("INSERT INTO user (id, username, password) VALUES (?, ?, ?)")
        .run(id, username, bcrypt.hashSync(password, 10));
      return toRequestResponse(true, "");
    } catch (error) {
      return toRequestResponse(false, error)
    }
  }

  // 检查是否有用户
  nouser(): RequestResponse {
    const rowCount = this.database
      .prepare("SELECT COUNT(*) AS count FROM user")
      .get() as { count: number };
    return toRequestResponse(true, rowCount.count === 0);
  }
}