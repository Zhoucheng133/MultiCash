import { existsSync, readFileSync, writeFileSync } from "fs";
import { nanoid } from "nanoid";
import { RequestResponse, toRequestResponse } from "./types";
import jwt from "jsonwebtoken";

const ENV_PATH = "db/.env";

let secrets = {
  ACCESS_SECRET: "",
  REFRESH_SECRET: ""
};

export function updateSecrets() {
  secrets.ACCESS_SECRET = nanoid(64);
  secrets.REFRESH_SECRET = nanoid(64);
  
  const content = `ACCESS_SECRET=${secrets.ACCESS_SECRET}\nREFRESH_SECRET=${secrets.REFRESH_SECRET}`;
  writeFileSync(ENV_PATH, content, "utf-8");
  console.log("[NOTE] JWT secrets updated");
}

export const getAccessSecret = () => secrets.ACCESS_SECRET;
export const getRefreshSecret = () => secrets.REFRESH_SECRET;

export class Auth{

  initJwt(){
    if (!existsSync("db")) {
      const { mkdirSync } = require("fs");
      mkdirSync("db");
    }
    if (existsSync(ENV_PATH)) {
      const content = readFileSync(ENV_PATH, "utf-8");
      const lines = content.split("\n");
      lines.forEach(line => {
        const [key, val] = line.split("=");
        if (key === "ACCESS_SECRET") secrets.ACCESS_SECRET = val.trim();
        if (key === "REFRESH_SECRET") secrets.REFRESH_SECRET = val.trim();
      });
    }
    
    if (!secrets.ACCESS_SECRET || !secrets.REFRESH_SECRET) {
      updateSecrets();
    }
  }

  constructor(){
    this.initJwt();
  }

  jwtCheck(headers: any): RequestResponse{
    const token = headers.token;
    if (!token) {
      return toRequestResponse(false, "No token provided");
    }

    try {
      const profile = jwt.verify(token, getAccessSecret()) as any;
      
      if (profile?.username) {
        return toRequestResponse(true, "");
      } else {
        return toRequestResponse(false, "Invalid token");
      }

    } catch (error: any) {

      if(error.name === "TokenExpiredError"){
        return toRequestResponse(false, "The token has expired");
      }
      
      return toRequestResponse(false, "Invalid token");
    }
  }

  refresh(cookie: any): RequestResponse {  
    const refresh_token = cookie.multicash_refresh_token;
    if (!refresh_token.value) {
      return toRequestResponse(false, "Not login yet");
    }
    try {
      const profile = jwt.verify(refresh_token.value, getRefreshSecret()) as any;
      
      if(profile?.username){
        const newAccessToken = jwt.sign(
          {
            username: profile.username,
          },
          getAccessSecret(),
          {
            expiresIn: "10m",
          }
        );

        return toRequestResponse(true, newAccessToken);
      }else{
        return toRequestResponse(false, "Invalid refresh token");
      }

    } catch (err: any) {
      return toRequestResponse(false, err.message);
    }
  }
}